import { logger } from '@cion-suite/core';
import { z } from 'zod';
import type { Versions } from '@app/catalog/types';
import { fsx } from '@app/utils/fsx';
import { paths } from '@app/utils/paths';

const log = logger.child('Catalog');

const shape = z.record(z.string(), z.string());

/** Нет файла или битый - пусто; запись его пересоздаст. */
async function read(sourceId: string): Promise<Versions> {
    try {
        const raw = await fsx.json.read<unknown>(paths.source(sourceId).versions);
        if (raw === undefined) return {};
        const parsed = shape.safeParse(raw);
        if (parsed.success) return parsed.data;
        log.warn('Versions file has wrong shape', { sourceId });
    } catch (e) {
        log.warn('Versions file unreadable', e, { sourceId });
    }
    return {};
}

// Всё в очереди: параллельные вызовы не теряют ключи
function merge(sourceId: string, entries: Versions, overwrite: boolean): Promise<void> {
    const file = paths.source(sourceId).versions;
    if (Object.keys(entries).length === 0) return Promise.resolve();
    return fsx.queue(file, async () => {
        const known = await read(sourceId);
        const next = overwrite ? { ...known, ...entries } : { ...entries, ...known };
        await fsx.json.write(file, next);
    });
}

/** Версии скачанного: sha файла репозитория при установке. */
export const versions = {
    read,
    /** Слияние с перезаписью ключей: так пишет тот, кто скачал. */
    record: (sourceId: string, entries: Versions): Promise<void> => merge(sourceId, entries, true),
    /** Только новые ключи: запоздалый снимок не вернёт старый sha. */
    adopt: (sourceId: string, entries: Versions): Promise<void> => merge(sourceId, entries, false),
};
