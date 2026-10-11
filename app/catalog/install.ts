import fs from 'node:fs/promises';
import path from 'node:path';
import { errors, logger } from '@cion-suite/core';
import { github } from '@app/github';
import { store } from '@app/sources/store';
import { manifest } from '@app/catalog/manifest';
import { fsx } from '@app/utils/fsx';
import { paths } from '@app/utils/paths';

const log = logger.child('Catalog');
const { dir } = manifest;

// ENOENT - файла нет; остальные сбои чтения не прячем
async function localSha(file: string): Promise<string | null> {
    try {
        return fsx.sha(await fs.readFile(file));
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw e;
    }
}

/** Скачивает скрипт источника, его cfg и общие support-файлы. */
export async function install(sourceId: string, fileName: string): Promise<void> {
    const source = await store.get(sourceId);
    const data = await manifest.get(sourceId);
    errors.assert(data.scripts.some(script => script.fileName === fileName), `Script not found: ${fileName}`, 'not_found');

    const local = paths.source(sourceId);
    const content = await github.file(source, `${dir.scripts}/${fileName}`);
    await fsx.write(fsx.confine(local.scripts, path.join(local.scripts, fileName)), content);

    // Сбой cfg (сеть, лимит) не валит установку, но и не молчит
    const cfgName = manifest.cfg.name(fileName);
    if (data.cfgs.some(cfg => cfg.fileName === cfgName)) {
        const cfg = await github.file(source, `${dir.scripts}/${dir.cfg}/${cfgName}`, { fallback: null })
            .catch((e: unknown) => {
                log.warn('Script cfg fetch failed', e, { sourceId, fileName });
                return null;
            });
        if (cfg) await fsx.write(fsx.confine(local.cfg, path.join(local.cfg, cfgName)), cfg);
    }

    // Без support скрипт не запустится: сбой не глотаем
    for (const file of data.support) {
        const target = fsx.confine(local.scripts, path.join(local.scripts, ...file.fileName.split('/')));
        if (await localSha(target) === file.sha) continue;
        await fsx.write(target, await github.file(source, `${dir.scripts}/${file.fileName}`));
    }
}
