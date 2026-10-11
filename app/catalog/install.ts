import path from 'node:path';
import { errors } from '@cion-suite/core';
import { github } from '@app/github';
import { store } from '@app/sources/store';
import { config } from '@app/catalog/config';
import { manifest } from '@app/catalog/manifest';
import type { Versions } from '@app/catalog/types';
import { versions } from '@app/catalog/versions';
import { fsx } from '@app/utils/fsx';
import { paths } from '@app/utils/paths';

const { dir } = manifest;

/** Скачивает скрипт источника, его cfg и общие support-файлы. */
export async function install(sourceId: string, fileName: string): Promise<void> {
    const source = await store.get(sourceId);
    const data = await manifest.get(sourceId);
    errors.assert(data.scripts.some(script => script.fileName === fileName), `Script not found: ${fileName}`, 'not_found');

    const local = paths.source(sourceId);
    const recorded: Versions = {};

    // Скрипт без cfg не загрузится: сбой валит установку
    const cfgName = manifest.cfg.name(fileName);
    if (data.cfgs.some(cfg => cfg.fileName === cfgName)) {
        const ref = { sourceId, path: manifest.cfg.path(fileName) };
        const cfg = await github.file(source, ref.path)
            .catch((e: unknown) => {
                throw errors.wrap(e, `Cannot download ${cfgName}`);
            });
        // Значения рабочего cfg переходят в новый файл
        await config.install(ref, cfg);
    }

    const known = await versions.read(sourceId);
    for (const file of data.support) {
        const key = `${dir.scripts}/${file.fileName}`;
        const target = fsx.confine(local.scripts, path.join(local.scripts, ...file.fileName.split('/')));
        if (known[key] === file.sha && await fsx.exists(target)) continue;
        const body = await github.file(source, key);
        await fsx.write(target, body);
        recorded[key] = fsx.sha(body);
    }

    // Скрипт последним: без записи он не должен лежать без cfg
    const content = await github.file(source, `${dir.scripts}/${fileName}`);
    await fsx.write(fsx.confine(local.scripts, path.join(local.scripts, fileName)), content);
    recorded[`${dir.scripts}/${fileName}`] = fsx.sha(content);

    await versions.record(sourceId, recorded);
}
