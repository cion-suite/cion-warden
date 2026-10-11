import fs from 'node:fs/promises';
import path from 'node:path';
import { errors, events, logger } from '@cion-suite/core';
import { catalog } from '@app/catalog';
import { fanout } from '@app/catalog/fanout';
import type { ManifestLibEntry } from '@app/catalog/types';
import { github } from '@app/github';
import { store, type SourceRecord } from '@app/sources/store';
import { fsx } from '@app/utils/fsx';
import { paths } from '@app/utils/paths';
import type { LibSync } from '@shared/types';

const log = logger.child('Libs');

interface Resolved {
    source: SourceRecord;
    lib: ManifestLibEntry;
}

async function resolve(sourceId: string, libId: string): Promise<Resolved> {
    const source = await store.get(sourceId);
    const lib = catalog.lib.find(await catalog.manifest.get(sourceId), sourceId, libId);
    if (!lib) throw errors.fail('not_found', `Library not found: ${libId}`);
    return { source, lib };
}

async function download(source: SourceRecord, lib: ManifestLibEntry): Promise<void> {
    const root = paths.source(source.id).lib;
    for (const file of lib.files) {
        const content = await github.file(source, `${catalog.dir.lib}/${file.path}`);
        await fsx.write(fsx.confine(root, path.join(root, file.path)), content);
    }
}

async function syncSource(source: SourceRecord): Promise<LibSync> {
    const data = await catalog.manifest.read(source.id);
    const result: LibSync = { ok: 0, failed: 0 };
    for (const lib of data?.libs ?? []) {
        try {
            await download(source, lib);
            result.ok++;
        } catch (e) {
            log.warn(`Library download failed: ${lib.name}`, e, { sourceId: source.id });
            result.failed++;
        }
    }
    return result;
}

/** Локальные копии lib из global_vault/<источник>/lib. */
export const libs = {
    async install(sourceId: string, libId: string): Promise<void> {
        const { source, lib } = await resolve(sourceId, libId);
        await download(source, lib);
        events.emit('lib:changed', { sourceId, libId });
    },

    // Весь каталог источника, а не только отсутствующие
    async sync(sourceId?: string): Promise<LibSync> {
        return fanout(sourceId, async (source) => {
            const result = await syncSource(source);
            events.emit('lib:changed', { sourceId: source.id, libId: '*' });
            return result;
        }, log, 'Libraries');
    },

    async remove(sourceId: string, libId: string): Promise<void> {
        const { source, lib } = await resolve(sourceId, libId);
        const root = paths.source(source.id).lib;
        if (lib.kind === 'folder') {
            await fs.rm(fsx.confine(root, path.join(root, lib.path)), { recursive: true, force: true });
        } else {
            for (const file of lib.files) {
                await fs.rm(fsx.confine(root, path.join(root, file.path)), { force: true });
            }
        }
        events.emit('lib:changed', { sourceId, libId });
    },

    /** Путь локальной копии; нет копии - not_found. */
    async local(sourceId: string, libId: string): Promise<string> {
        const { source, lib } = await resolve(sourceId, libId);
        const root = paths.source(source.id).lib;
        const target = fsx.confine(root, path.join(root, lib.path));
        try {
            await fs.access(target);
        } catch (e) {
            throw errors.fail('not_found', `Library is not downloaded: ${libId}`, { cause: e });
        }
        return target;
    },

    /** Страница lib в репозитории; нет ссылки - not_found. */
    async url(sourceId: string, libId: string): Promise<string> {
        const { lib } = await resolve(sourceId, libId);
        if (lib.webUrl === undefined) throw errors.fail('not_found', `Library has no web page: ${libId}`);
        return lib.webUrl;
    },
};
