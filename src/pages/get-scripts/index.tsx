import { useState } from 'react';

import { useT } from '@/shared/i18n';
import { useSetNavbarSlot } from '@/shared/lib/navbar-slot';
import { Input } from '@/shared/ui/shadcn/input';
import { useRemoteScripts } from '@/entities/remote-script';
import { useVaultSources } from '@/entities/vault-source';
import { SourcesDialog } from '@/features/sources-manage';
import { RemoteScriptList } from '@/widgets/remote-list';
import type { RemoteScriptMeta } from '@shared/types/get-scripts';
import { toast } from '@/shared/lib/toast';

const KNOWN_ERROR_KEYS = new Set([
    'sources.tokenInvalid',
    'sources.tokenNoAccess',
    'sources.repoNotFound',
]);

function toErrorKey(err: unknown): string {
    const msg = err instanceof Error ? err.message : '';
    for (const key of KNOWN_ERROR_KEYS) {
        if (msg.includes(key)) return key;
    }
    return 'error';
}

export function GetScriptsPage() {
    const t = useT();
    const [search, setSearch] = useState('');
    const [sourcesOpen, setSourcesOpen] = useState(false);
    const [syncing, setSyncing] = useState(false);

    const { scripts, setScripts, loading, refresh } = useRemoteScripts();
    const { sources, refresh: refreshSources } = useVaultSources();

    const q = search.trim().toLowerCase();
    const filtered = q ? scripts.filter((s) => s.name.toLowerCase().includes(q)) : scripts;

    useSetNavbarSlot(
        <Input
            className="h-8 w-48"
            placeholder={t('scripts.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
        />,
    );

    const handleSync = async () => {
        const gitSources = sources.filter((s) => s.type === 'git');
        if (gitSources.length === 0) {
            await refresh();
            return;
        }
        setSyncing(true);
        try {
            const results = await Promise.allSettled(
                gitSources.map((s) => window.app!.getScripts.syncSource(s.id)),
            );
            const firstFailed = results.find((r) => r.status === 'rejected');
            if (firstFailed) {
                toast.error(t(toErrorKey(firstFailed.reason)));
            } else {
                toast.success(t('sources.syncDone'));
            }
            await refresh();
        } finally {
            setSyncing(false);
        }
    };

    const handleDownload = async (script: RemoteScriptMeta) => {
        try {
            await window.app?.getScripts.download(script.sourceId, script.fileName);
        } catch (err) {
            toast.error(t(toErrorKey(err)));
            return;
        }
        setScripts((prev) =>
            prev.map((s) =>
                s.id === script.id
                    ? { ...s, isDownloaded: true, hasUpdate: false, localSha: s.sha }
                    : s,
            ),
        );
        toast.success(t('getScripts.downloaded', { name: script.name }));
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
                <RemoteScriptList
                    scripts={filtered}
                    loading={loading || syncing}
                    onRefresh={() => void handleSync()}
                    onSources={() => setSourcesOpen(true)}
                    onDownload={handleDownload}
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
