import { errors, events, logger } from '@cion-suite/core';
import { github } from '@app/github';
import { store, type SourceRecord } from '@app/sources/store';
import { derive } from '@app/catalog/derive';
import { MANIFEST_VERSION, manifest } from '@app/catalog/manifest';
import type { ManifestFile } from '@app/catalog/types';
import type { SourceSync } from '@shared/types';

const log = logger.child('Catalog');

const TTL_MS = 30_000;

const inFlight = new Map<string, Promise<SourceSync>>();

function announce(sourceId: string, lastSyncedAt: number, fromCache: boolean): SourceSync {
    const result: SourceSync = { sourceId, lastSyncedAt, fromCache };
    events.emit('source:synced', result);
    return result;
}

async function fetchSidecar(source: SourceRecord): Promise<Buffer | null> {
    try {
        return await github.file(source, derive.sidecar.path, { fallback: null });
    } catch (e) {
        log.warn('Fonts sidecar fetch failed', e, { sourceId: source.id });
        return null;
    }
}

async function refresh(source: SourceRecord): Promise<SourceSync> {
    const branch = source.branch || 'main';
    const existing = await manifest.read(source.id);
    // Etag чужой формы или чужой ветки может дать 304 и
    // оставить устаревшие записи навсегда
    const current = existing?.version === MANIFEST_VERSION && existing.branch === branch ? existing : null;
    if (current && Date.now() - current.lastCheckedAt < TTL_MS) {
        return announce(source.id, current.lastSyncedAt, true);
    }

    const reply = await github.tree(source, current?.etag);
    const now = Date.now();
    if (reply === null) {
        if (!current) throw errors.fail('failed', 'Manifest cache is missing', { status: 304 });
        await manifest.write(source.id, { ...current, lastCheckedAt: now });
        return announce(source.id, current.lastSyncedAt, true);
    }

    const { tree } = reply.tree;
    const to = derive.links(source);
    const hasSidecar = tree.some(entry => entry.type === 'blob' && entry.path === derive.sidecar.path);
    const sidecar = hasSidecar ? derive.sidecar.parse(await fetchSidecar(source)) : null;

    const next: ManifestFile = {
        version: MANIFEST_VERSION,
        etag: reply.etag,
        treeSha: reply.tree.sha,
        branch,
        lastSyncedAt: now,
        lastCheckedAt: now,
        ...derive.scripts(tree, to),
        libs: derive.libs(tree, to),
        presets: derive.presets(tree, to),
        fonts: derive.fonts(tree, sidecar, to),
    };
    await manifest.write(source.id, next);
    return announce(source.id, now, false);
}

// Ключ с веткой: смена ветки посреди запроса не делит
// устаревший promise со следующим вызовом
async function syncOne(sourceId: string): Promise<SourceSync> {
    const source = await store.get(sourceId);
    const key = `${source.id}@${source.branch || 'main'}`;
    const running = inFlight.get(key);
    if (running) return running;
    const promise = refresh(source).finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return promise;
}

/** Обновляет manifest источника или всех; event source:synced. */
export async function sync(sourceId?: string): Promise<SourceSync[]> {
    if (sourceId !== undefined) return [await syncOne(sourceId)];

    const sources = await store.list();
    const results = await Promise.allSettled(sources.map(source => syncOne(source.id)));
    const synced: SourceSync[] = [];
    for (const result of results) {
        // Успешные источники уже объявили source:synced
        if (result.status === 'rejected') throw errors.wrap(result.reason, 'Cannot sync all sources');
        synced.push(result.value);
    }
    return synced;
}
