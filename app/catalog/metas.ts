import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '@cion-suite/core';
import { store, type SourceRecord } from '@app/sources/store';
import { manifest } from '@app/catalog/manifest';
import type { CatalogMetas, ManifestFile, Versions } from '@app/catalog/types';
import { versions } from '@app/catalog/versions';
import { fsx } from '@app/utils/fsx';
import { paths } from '@app/utils/paths';
import type { Bind, CatalogScript, Lib } from '@shared/types';

const log = logger.child('Catalog');
const { dir } = manifest;

type Status = 'missing' | 'fresh' | 'stale';

async function toMetas(source: SourceRecord, data: ManifestFile): Promise<CatalogMetas> {
    const root = paths.source(source.id).base;
    const known = await versions.read(source.id);
    const adopted: Versions = {};

    // Версия - запись об установке, не sha правленого файла.
    // Ключ - путь от корня источника.
    async function status(key: string, sha: string): Promise<Status> {
        const file = path.join(root, key);
        try {
            await fs.stat(file);
        } catch (e) {
            if (fsx.isMissing(e)) return 'missing';
            // "Не скачан" заставил бы sync затереть правки пользователя
            log.warn('Local file unreadable', e, { sourceId: source.id, key });
            return 'fresh';
        }
        const recorded = known[key];
        if (recorded !== undefined) return recorded === sha ? 'fresh' : 'stale';

        // Скачан без записи: совпадение с manifest - версия известна
        try {
            if (fsx.sha(await fs.readFile(file)) !== sha) return 'stale';
        } catch (e) {
            log.warn('Local file unreadable', e, { sourceId: source.id, key });
            return 'fresh';
        }
        adopted[key] = sha;
        return 'fresh';
    }

    // support общий для скриптов источника: одно сравнение на всех
    const supportStale = (await Promise.all(data.support.map(item => status(`${dir.scripts}/${item.fileName}`, item.sha))))
        .some(state => state !== 'fresh');

    const scripts = await Promise.all(data.scripts.map(async (item): Promise<CatalogScript> => {
        const state = await status(`${dir.scripts}/${item.fileName}`, item.sha);
        return {
            id: `${source.id}:${item.fileName}`,
            name: manifest.stem(item.fileName),
            fileName: item.fileName,
            sourceId: source.id,
            sourceName: source.name,
            sha: item.sha,
            isDownloaded: state !== 'missing',
            hasUpdate: state !== 'missing' && (state === 'stale' || supportStale),
            downloadUrl: item.downloadUrl ?? undefined,
        };
    }));

    const libs = await Promise.all(data.libs.map(async (lib): Promise<Lib> => {
        const states = await Promise.all(lib.files.map(file => status(`${dir.lib}/${file.path}`, file.sha)));
        const isDownloaded = states.length > 0 && !states.includes('missing');
        return {
            id: manifest.lib.id(source.id, lib.name),
            name: lib.name,
            kind: lib.kind,
            path: lib.path,
            sourceId: source.id,
            sourceName: source.name,
            sha: lib.sha,
            isDownloaded,
            hasUpdate: isDownloaded && states.includes('stale'),
            webUrl: lib.webUrl,
            files: lib.files,
        };
    }));

    const presets = await Promise.all(data.presets.map(async (item): Promise<Bind> => {
        const state = await status(`${dir.presets}/${item.fileName}`, item.sha);
        return {
            id: manifest.preset.id(source.id, item.fileName),
            name: manifest.stem(item.fileName),
            fileName: item.fileName,
            sourceId: source.id,
            sourceName: source.name,
            sha: item.sha,
            isDownloaded: state !== 'missing',
            hasUpdate: state === 'stale',
            downloadUrl: item.downloadUrl ?? undefined,
        };
    }));

    // Сбой записи не должен ронять список
    await versions.adopt(source.id, adopted).catch((e: unknown) => {
        log.warn('Versions not adopted', e, { sourceId: source.id });
    });
    return { scripts, libs, presets };
}

async function ofSource(source: SourceRecord): Promise<CatalogMetas> {
    const data = await manifest.read(source.id);
    return data ? toMetas(source, data) : { scripts: [], libs: [], presets: [] };
}

/** Каталог источника или всех; без manifest - пусто. */
export async function metas(sourceId?: string): Promise<CatalogMetas> {
    if (sourceId !== undefined) return ofSource(await store.get(sourceId));

    const sources = await store.list();
    const results = await Promise.allSettled(sources.map(ofSource));
    const all: CatalogMetas = { scripts: [], libs: [], presets: [] };
    results.forEach((result, index) => {
        if (result.status === 'rejected') {
            log.warn('Source catalog failed', result.reason, { sourceId: sources[index]?.id });
            return;
        }
        all.scripts.push(...result.value.scripts);
        all.libs.push(...result.value.libs);
        all.presets.push(...result.value.presets);
    });
    return all;
}
