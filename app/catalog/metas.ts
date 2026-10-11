import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '@cion-suite/core';
import { store, type SourceRecord } from '@app/sources/store';
import { manifest } from '@app/catalog/manifest';
import type { CatalogMetas, LocalCache, LocalCacheEntry, ManifestFile } from '@app/catalog/types';
import { fsx } from '@app/utils/fsx';
import { paths } from '@app/utils/paths';
import type { Bind, CatalogScript, Lib } from '@shared/types';

const log = logger.child('Catalog');
const { dir } = manifest;

async function readCache(sourceId: string): Promise<LocalCache> {
    const cache = await fsx.json.read<LocalCache>(paths.source(sourceId).cache).catch((e: unknown) => {
        log.warn('Local cache unreadable', e, { sourceId });
        return undefined;
    });
    return cache ?? {};
}

// Без смены mtime и size файл не перечитываем
async function resolveSha(file: string, cached: LocalCacheEntry | undefined): Promise<LocalCacheEntry | null> {
    const stat = await fs.stat(file).catch(() => null);
    if (!stat) return null;
    if (cached && cached.mtime === stat.mtimeMs && cached.size === stat.size) return cached;
    return { mtime: stat.mtimeMs, size: stat.size, sha: fsx.sha(await fs.readFile(file)) };
}

function sameCache(a: LocalCache, b: LocalCache): boolean {
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    return keys.every((key) => {
        const x = a[key];
        const y = b[key];
        return x !== undefined && y !== undefined && x.mtime === y.mtime && x.size === y.size && x.sha === y.sha;
    });
}

async function toMetas(source: SourceRecord, data: ManifestFile): Promise<CatalogMetas> {
    const root = paths.source(source.id).base;
    const cache = await readCache(source.id);
    const next: LocalCache = {};

    // Ключ кеша - путь от корня источника
    async function local(key: string): Promise<LocalCacheEntry | null> {
        const entry = await resolveSha(path.join(root, key), cache[key]);
        if (entry) next[key] = entry;
        return entry;
    }

    // support общий для скриптов источника: одно сравнение на всех
    const supportStale = (await Promise.all(data.support.map(async (item) => {
        const found = await local(`${dir.scripts}/${item.fileName}`);
        return found?.sha !== item.sha;
    }))).some(Boolean);

    const scripts = await Promise.all(data.scripts.map(async (item): Promise<CatalogScript> => {
        const found = await local(`${dir.scripts}/${item.fileName}`);
        return {
            id: `${source.id}:${item.fileName}`,
            name: manifest.stem(item.fileName),
            fileName: item.fileName,
            sourceId: source.id,
            sourceName: source.name,
            sha: item.sha,
            localSha: found?.sha,
            isDownloaded: found !== null,
            hasUpdate: found !== null && (found.sha !== item.sha || supportStale),
            downloadUrl: item.downloadUrl ?? undefined,
        };
    }));

    const libs = await Promise.all(data.libs.map(async (lib): Promise<Lib> => {
        let isDownloaded = lib.files.length > 0;
        let hasUpdate = false;
        for (const file of lib.files) {
            const found = await local(`${dir.lib}/${file.path}`);
            if (!found) isDownloaded = false;
            else if (found.sha !== file.sha) hasUpdate = true;
        }
        return {
            id: manifest.lib.id(source.id, lib.name),
            name: lib.name,
            kind: lib.kind,
            path: lib.path,
            sourceId: source.id,
            sourceName: source.name,
            sha: lib.sha,
            isDownloaded,
            hasUpdate: isDownloaded && hasUpdate,
            webUrl: lib.webUrl,
            files: lib.files,
        };
    }));

    const presets = await Promise.all(data.presets.map(async (item): Promise<Bind> => {
        const found = await local(`${dir.presets}/${item.fileName}`);
        return {
            id: manifest.preset.id(source.id, item.fileName),
            name: manifest.stem(item.fileName),
            fileName: item.fileName,
            sourceId: source.id,
            sourceName: source.name,
            sha: item.sha,
            isDownloaded: found !== null,
            hasUpdate: found !== null && found.sha !== item.sha,
            downloadUrl: item.downloadUrl ?? undefined,
        };
    }));

    // Кеш - оптимизация: сбой записи не должен ронять список
    if (!sameCache(cache, next)) {
        await fsx.write(paths.source(source.id).cache, JSON.stringify(next)).catch((e: unknown) => {
            log.warn('Local cache not saved', e, { sourceId: source.id });
        });
    }
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
