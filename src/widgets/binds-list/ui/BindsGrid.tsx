import { Download, Plug, RefreshCw } from 'lucide-react';

import { useT } from '@/shared/i18n';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/shadcn/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/shadcn/empty';
import { Skeleton } from '@/shared/ui/shadcn/skeleton';
import type { RemotePresetMeta } from '@shared/types/binds';
import { BindsCard } from './BindsCard';

interface BindsGridProps {
    presets: RemotePresetMeta[];
    loading: boolean;
    refreshing: boolean;
    busyIds: ReadonlySet<string>;
    bulkBusy: boolean;
    canBulkDownload: boolean;
    onRefresh: () => void;
    onSources: () => void;
    onDownloadAll: () => void;
    onOpen: (preset: RemotePresetMeta) => void;
    onDownload: (preset: RemotePresetMeta) => void;
    onDelete: (preset: RemotePresetMeta) => void;
    onOpenLocal: (preset: RemotePresetMeta) => void;
}

export function BindsGrid({
    presets,
    loading,
    refreshing,
    busyIds,
    bulkBusy,
    canBulkDownload,
    onRefresh,
    onSources,
    onDownloadAll,
    onOpen,
    onDownload,
    onDelete,
    onOpenLocal,
}: BindsGridProps) {
    const t = useT();

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="flex shrink-0 items-center gap-2">
                <Button variant="outline" size="sm" onClick={onSources}>
                    <Plug data-icon="inline-start" />
                    {t('sources.title')}
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={!canBulkDownload || bulkBusy}
                    onClick={onDownloadAll}
                >
                    <Download data-icon="inline-start" />
                    {t('binds.downloadAll')}
                </Button>
                <div className="flex-1" />
                <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={refreshing}
                    onClick={onRefresh}
                    title={t('scripts.refresh')}
                >
                    <RefreshCw className={cn(refreshing && 'animate-spin')} />
                </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {loading ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {Array.from({ length: 4 }, (_, i) => (
                            <Skeleton key={i} className="h-24 rounded-lg" />
                        ))}
                    </div>
                ) : presets.length === 0 ? (
                    <Empty className="h-full">
                        <EmptyHeader>
                            <EmptyTitle>{t('binds.title')}</EmptyTitle>
                            <EmptyDescription>{t('binds.empty')}</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {presets.map((p) => (
                            <BindsCard
                                key={p.id}
                                preset={p}
                                busy={busyIds.has(p.id)}
                                onOpen={onOpen}
                                onDownload={onDownload}
                                onDelete={onDelete}
                                onOpenLocal={onOpenLocal}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
