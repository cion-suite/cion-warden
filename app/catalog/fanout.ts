import type { logger } from '@cion-suite/core';
import { store, type SourceRecord } from '@app/sources/store';

interface Tally {
    ok: number;
    failed: number;
}

/** Один источник или все; отказ источника считается в failed. */
export async function fanout(
    sourceId: string | undefined,
    work: (source: SourceRecord) => Promise<Tally>,
    log: ReturnType<typeof logger.child>,
    what: string,
): Promise<Tally> {
    const sources = sourceId === undefined ? await store.list() : [await store.get(sourceId)];
    const settled = await Promise.allSettled(sources.map(work));
    const total: Tally = { ok: 0, failed: 0 };
    for (const [index, outcome] of settled.entries()) {
        if (outcome.status === 'fulfilled') {
            total.ok += outcome.value.ok;
            total.failed += outcome.value.failed;
        } else {
            log.warn(`${what} sync failed`, outcome.reason, { sourceId: sources[index]?.id });
            total.failed++;
        }
    }
    return total;
}
