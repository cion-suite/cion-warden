import { useState } from 'react';

import { useT } from '@/shared/i18n';
import { useSetNavbarSlot } from '@/shared/lib/navbar-slot';
import { toErrorKey } from '@/shared/lib/source-errors';
import { toast } from '@/shared/lib/toast';
import { Input } from '@/shared/ui/shadcn/input';
import { useRemoteLibraries } from '@/entities/remote-library';
import { useVaultSources } from '@/entities/vault-source';
import { useLibActions } from '@/features/lib-manage';
import { SourcesDialog } from '@/features/sources-manage';
import { RemoteLibraryList } from '@/widgets/remote-list';

export function LibrariesPage() {
    const t = useT();
    const [search, setSearch] = useState('');
    const [sourcesOpen, setSourcesOpen] = useState(false);
    const [syncing, setSyncing] = useState(false);

    const { libs, loading, refresh } = useRemoteLibraries();
    const { sources, refresh: refreshSources } = useVaultSources();

    const actions = useLibActions(() => void refresh());

    const q = search.trim().toLowerCase();
    const filtered = q ? libs.filter((l) => l.name.toLowerCase().includes(q)) : libs;
    const canBulkDownload = libs.some((l) => !l.isDownloaded);

    useSetNavbarSlot(
        <Input
            className="h-8 w-48"
            placeholder={t('libs.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
        />,
    );

    const handleSync = async () => {
        setSyncing(true);
        try {
            const results = (await window.app?.vault.syncAll()) ?? [];
            const firstFailed = results.find((r) => !r.ok);
            if (firstFailed) {
                toast.error(toErrorKey(new Error(firstFailed.error ?? ''), t));
            } else if (results.length > 0) {
                toast.success(t('sources.syncDone'));
            }
            await refresh();
        } finally {
            setSyncing(false);
        }
    };

    const handleSourcesChange = () => {
        void (async () => {
            await refreshSources();
            await refresh();
        })();
    };

    return (
        <>
            <div className="mx-auto flex h-full w-full min-h-0 max-w-4xl flex-col">
                <RemoteLibraryList
                    libs={filtered}
                    loading={loading}
                    refreshing={syncing}
                    busyIds={actions.busyIds}
                    bulkBusy={actions.bulkBusy}
                    canBulkDownload={canBulkDownload}
                    onRefresh={() => void handleSync()}
                    onSources={() => setSourcesOpen(true)}
                    onDownloadAll={() => void actions.downloadAll()}
                    onDownload={(lib) => void actions.download(lib)}
                    onDelete={(lib) => void actions.deleteLocal(lib)}
                    onOpenLocal={(lib) => void actions.openLocal(lib)}
                    onOpenWeb={(lib) => void actions.openWeb(lib)}
                />
            </div>

            <SourcesDialog
                open={sourcesOpen}
                onOpenChange={setSourcesOpen}
                sources={sources}
                onSourcesChange={handleSourcesChange}
            />
        </>
    );
}
