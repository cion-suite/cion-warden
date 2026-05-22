import { useState } from 'react';
import { useT } from '@/shared/i18n';
import { toast } from '@/shared/lib/toast';
import { toErrorKey } from '@/shared/lib/source-errors';
import type { RemoteLibraryMeta } from '@shared/types/libs';

function bumpCount(prev: ReadonlyMap<string, number>, id: string, delta: 1 | -1): Map<string, number> {
    const next = new Map(prev);
    const v = (next.get(id) ?? 0) + delta;
    if (v <= 0) next.delete(id);
    else next.set(id, v);
    return next;
}

export function useLibActions(onChanged: () => void) {
    const t = useT();
    const [busyCounts, setBusyCounts] = useState<ReadonlyMap<string, number>>(() => new Map());
    const [bulkBusy, setBulkBusy] = useState(false);

    const busyIds: ReadonlySet<string> = new Set(busyCounts.keys());

    const runOne = async (lib: RemoteLibraryMeta, op: () => Promise<void>, successKey: string) => {
        setBusyCounts((prev) => bumpCount(prev, lib.id, 1));
        try {
            await op();
            toast.success(t(successKey, { name: lib.name }));
            onChanged();
        } catch (err) {
            toast.error(toErrorKey(err, t));
        } finally {
            setBusyCounts((prev) => bumpCount(prev, lib.id, -1));
        }
    };

    const download = (lib: RemoteLibraryMeta) =>
        runOne(lib, () => window.app!.libs.download(lib.sourceId, lib.id), 'libs.downloaded');

    const deleteLocal = (lib: RemoteLibraryMeta) =>
        runOne(lib, () => window.app!.libs.delete(lib.sourceId, lib.id), 'libs.deleted');

    const openLocal = (lib: RemoteLibraryMeta) =>
        window.app!.libs.openLocal(lib.sourceId, lib.id);

    const openWeb = (lib: RemoteLibraryMeta) =>
        window.app!.libs.openWeb(lib.sourceId, lib.id);

    const downloadAll = async () => {
        setBulkBusy(true);
        try {
            const res = await window.app!.libs.downloadAll();
            if (res.failed > 0) toast.warning(t('libs.bulkDoneWithFails', { ok: res.ok, failed: res.failed }));
            else toast.success(t('libs.bulkDone', { ok: res.ok }));
            onChanged();
        } catch (err) {
            toast.error(toErrorKey(err, t));
        } finally {
            setBulkBusy(false);
        }
    };

    return { busyIds, bulkBusy, download, deleteLocal, openLocal, openWeb, downloadAll };
}
