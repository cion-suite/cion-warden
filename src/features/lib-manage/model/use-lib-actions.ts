import { useState } from 'react';
import { useT } from '@/shared/i18n';
import { toast } from '@/shared/lib/toast';
import { toErrorKey } from '@/shared/lib/source-errors';
import type { RemoteLibraryMeta } from '@shared/types/libs';

function withId(prev: ReadonlySet<string>, id: string): Set<string> {
    const next = new Set(prev);
    next.add(id);
    return next;
}

function withoutId(prev: ReadonlySet<string>, id: string): Set<string> {
    const next = new Set(prev);
    next.delete(id);
    return next;
}

export function useLibActions(onChanged: () => void) {
    const t = useT();
    const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set());
    const [bulkBusy, setBulkBusy] = useState(false);

    const runOne = async (lib: RemoteLibraryMeta, op: () => Promise<void>, successKey: string) => {
        setBusyIds((prev) => withId(prev, lib.id));
        try {
            await op();
            toast.success(t(successKey, { name: lib.name }));
            onChanged();
        } catch (err) {
            toast.error(t(toErrorKey(err)));
        } finally {
            setBusyIds((prev) => withoutId(prev, lib.id));
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
            toast.error(t(toErrorKey(err)));
        } finally {
            setBulkBusy(false);
        }
    };

    return { busyIds, bulkBusy, download, deleteLocal, openLocal, openWeb, downloadAll };
}
