import path from 'node:path';
import { errors, logger } from '@cion-suite/core';
import { github } from '@app/github';
import { store } from '@app/sources/store';
import { manifest } from '@app/catalog/manifest';
import { fsx } from '@app/utils/fsx';
import { paths } from '@app/utils/paths';

const log = logger.child('Catalog');
const { dir } = manifest;

/** Скачивает скрипт источника и его cfg, если cfg есть. */
export async function install(sourceId: string, fileName: string): Promise<void> {
    const source = await store.get(sourceId);
    const data = await manifest.get(sourceId);
    errors.assert(data.scripts.some(script => script.fileName === fileName), `Script not found: ${fileName}`, 'not_found');

    const local = paths.source(sourceId);
    const content = await github.file(source, `${dir.scripts}/${fileName}`);
    await fsx.write(fsx.confine(local.scripts, path.join(local.scripts, fileName)), content);

    // Сбой cfg (сеть, лимит) не валит установку, но и не молчит
    const cfgName = `${manifest.stem(fileName)}.json`;
    const cfg = await github.file(source, `${dir.scripts}/${dir.cfg}/${cfgName}`, { fallback: null })
        .catch((e: unknown) => {
            log.warn('Script cfg fetch failed', e, { sourceId, fileName });
            return null;
        });
    if (cfg) await fsx.write(fsx.confine(local.cfg, path.join(local.cfg, cfgName)), cfg);
}
