import type { MissingItem } from '@shared/types/script-deps';

function installItem(item: MissingItem): Promise<void> {
    return item.kind === 'lib'
        ? window.libs.install(item.sourceId, item.libId)
        : window.binds.install(item.sourceId, item.presetId);
}

/** По очереди; сбой не прерывает, итог - число сбоев. */
export async function installMissing(
    missing: MissingItem[],
    onProgress: (done: number, item: MissingItem) => void,
): Promise<number> {
    let failed = 0;
    for (const [done, item] of missing.entries()) {
        onProgress(done, item);
        try {
            await installItem(item);
        } catch {
            failed++;
        }
    }
    return failed;
}
