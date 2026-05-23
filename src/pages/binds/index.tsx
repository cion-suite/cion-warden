import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';

import { useT } from '@/shared/i18n';
import { useSetNavbarSubtitle, useSetNavbarTitleAction } from '@/shared/lib/navbar-slot';
import { toErrorKey } from '@/shared/lib/source-errors';
import { toast } from '@/shared/lib/toast';
import { useRemotePresets } from '@/entities/remote-preset';
import { useVaultSources } from '@/entities/vault-source';
import { usePresetActions, usePresetForm } from '@/features/preset-manage';
import { SourcesDialog } from '@/features/sources-manage';
import { BindsGrid, PresetForm } from '@/widgets/binds-list';

export function BindsPage() {
    const t = useT();
    const [sourcesOpen, setSourcesOpen] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const { presets, loading, refresh } = useRemotePresets();
    const { sources, refresh: refreshSources } = useVaultSources();

    const actions = usePresetActions(() => void refresh());

    const downloaded = useMemo(() => presets.filter((p) => p.isDownloaded), [presets]);
    const canBulkDownload = presets.some((p) => !p.isDownloaded);

    // Mode A: there is exactly one preset total AND it is downloaded — render
    // its form directly. We require presets.length === 1 (not just
    // downloaded.length === 1) so that having extra available-to-download
    // presets keeps the grid (and its Sources/DownloadAll toolbar) reachable.
    const modeASoloId =
        selectedId === null && presets.length === 1 && downloaded.length === 1
            ? (downloaded[0]?.id ?? null)
            : null;

    const activeId = selectedId ?? modeASoloId;
    const activePreset = useMemo(
        () => (activeId ? (presets.find((p) => p.id === activeId) ?? null) : null),
        [activeId, presets],
    );

    const form = usePresetForm(
        activePreset?.sourceId ?? null,
        activePreset?.id ?? null,
    );

    // Breadcrumb: subtitle is static "/ {name}" text; clicking the route
    // title ("Binds") is the back affordance. In Mode A (no selectedId) there
    // is nowhere to go back, so the title action stays null.
    useSetNavbarSubtitle(
        activePreset ? (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <ChevronRight className="size-4 opacity-60" />
                <span className="truncate">{activePreset.name}</span>
            </div>
        ) : null,
    );
    useSetNavbarTitleAction(
        activePreset && selectedId !== null ? () => setSelectedId(null) : null,
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
            // syncAll fires `vault:source-synced` per source which already
            // triggers refresh() inside useRemotePresets; no explicit refresh
            // needed here.
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

    const handleSave = async () => {
        try {
            await form.save();
            toast.success(t('binds.saved'));
        } catch (err) {
            toast.error(toErrorKey(err, t));
        }
    };

    const handleReset = async () => {
        try {
            await form.reset();
        } catch (err) {
            toast.error(toErrorKey(err, t));
        }
    };

    const showForm = activePreset !== null;

    return (
        <>
            <div className="mx-auto flex h-full w-full min-h-0 max-w-5xl flex-col">
                {showForm ? (
                    <PresetForm
                        schema={form.schema}
                        values={form.values}
                        loading={form.loading}
                        dirty={form.dirty}
                        saving={form.saving}
                        onChange={form.setValue}
                        onSave={() => void handleSave()}
                        onReset={() => void handleReset()}
                    />
                ) : (
                    <BindsGrid
                        presets={presets}
                        loading={loading}
                        refreshing={syncing}
                        busyIds={actions.busyIds}
                        bulkBusy={actions.bulkBusy}
                        canBulkDownload={canBulkDownload}
                        onRefresh={() => void handleSync()}
                        onSources={() => setSourcesOpen(true)}
                        onDownloadAll={() => void actions.downloadAll()}
                        onOpen={(p) => setSelectedId(p.id)}
                        onDownload={(p) => void actions.download(p)}
                        onDelete={(p) => void actions.deleteLocal(p)}
                        onOpenLocal={(p) => void actions.openLocal(p)}
                    />
                )}
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
