import { useState } from 'react';
import { useT } from '@/shared/i18n';
import { toast } from '@/shared/lib/toast';
import { toErrorKey } from '@/shared/lib/source-errors';
import type { RemotePresetMeta } from '@shared/types/binds';

function bumpCount(prev: ReadonlyMap<string, number>, id: string, delta: 1 | -1): Map<string, number> {
    const next = new Map(prev);
    const v = (next.get(id) ?? 0) + delta;
    if (v <= 0) next.delete(id);
    else next.set(id, v);
    return next;
}

export function usePresetActions(onChanged: () => void) {
    const t = useT();
    const [busyCounts, setBusyCounts] = useState<ReadonlyMap<string, number>>(() => new Map());
    const [bulkBusy, setBulkBusy] = useState(false);

    const busyIds: ReadonlySet<string> = new Set(busyCounts.keys());

    const runOne = async (
        preset: RemotePresetMeta,
        op: () => Promise<void>,
        successKey: string,
    ) => {
        setBusyCounts((prev) => bumpCount(prev, preset.id, 1));
        try {
            await op();
            toast.success(t(successKey, { name: preset.name }));
            onChanged();
        } catch (err) {
            toast.error(toErrorKey(err, t));
        } finally {
            setBusyCounts((prev) => bumpCount(prev, preset.id, -1));
        }
    };

    const download = (preset: RemotePresetMeta) =>
        runOne(preset, () => window.app!.binds.download(preset.sourceId, preset.id), 'binds.downloaded');

    const deleteLocal = (preset: RemotePresetMeta) =>
        runOne(preset, () => window.app!.binds.delete(preset.sourceId, preset.id), 'binds.deleted');

    const openLocal = (preset: RemotePresetMeta) =>
        window.app!.binds.openLocal(preset.sourceId, preset.id);

    const downloadAll = async () => {
        setBulkBusy(true);
        try {
            const res = await window.app!.binds.downloadAll();
            if (res.failed > 0) toast.warning(t('binds.bulkDoneWithFails', { ok: res.ok, failed: res.failed }));
            else toast.success(t('binds.bulkDone', { ok: res.ok }));
            onChanged();
        } catch (err) {
            toast.error(toErrorKey(err, t));
        } finally {
            setBulkBusy(false);
        }
    };

    return { busyIds, bulkBusy, download, deleteLocal, openLocal, downloadAll };
}
