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

export function GetScriptsPage() {
    const t = useT();
    const [search, setSearch] = useState('');
    const [sourcesOpen, setSourcesOpen] = useState(false);

    const { scripts, loading, refresh } = useRemoteScripts();
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

    const handleDownload = async (script: RemoteScriptMeta) => {
        await window.app?.getScripts.download(script.sourceId, script.fileName);
        await refresh();
        toast.success(t('getScripts.downloaded', { name: script.name }));
    };

    return (
        <>
            <div className="mx-auto flex h-full w-full min-h-0 max-w-4xl flex-col">
                <RemoteScriptList
                    scripts={filtered}
                    loading={loading}
                    onRefresh={() => void refresh()}
                    onSources={() => setSourcesOpen(true)}
                    onDownload={handleDownload}
                />
            </div>

            <SourcesDialog
                open={sourcesOpen}
                onOpenChange={setSourcesOpen}
                sources={sources}
                onSourcesChange={() => void refreshSources()}
                onScriptsChange={() => void refresh()}
            />
        </>
    );
}
