import { Download, Plug, RefreshCw } from 'lucide-react';

import { useT } from '@/shared/i18n';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/shadcn/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/shadcn/empty';
import { Skeleton } from '@/shared/ui/shadcn/skeleton';
import type { RemoteLibraryMeta } from '@shared/types/libs';
import { RemoteLibraryRow } from './RemoteLibraryRow';

interface RemoteLibraryListProps {
    libs: RemoteLibraryMeta[];
    loading: boolean;
    refreshing: boolean;
    busyIds: ReadonlySet<string>;
    bulkBusy: boolean;
    canBulkDownload: boolean;
    onRefresh: () => void;
    onSources: () => void;
    onDownloadAll: () => void;
    onDownload: (lib: RemoteLibraryMeta) => void;
    onDelete: (lib: RemoteLibraryMeta) => void;
    onOpenLocal: (lib: RemoteLibraryMeta) => void;
    onOpenWeb: (lib: RemoteLibraryMeta) => void;
}

export function RemoteLibraryList({
    libs,
    loading,
    refreshing,
    busyIds,
    bulkBusy,
    canBulkDownload,
    onRefresh,
    onSources,
    onDownloadAll,
    onDownload,
    onDelete,
    onOpenLocal,
    onOpenWeb,
}: RemoteLibraryListProps) {
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
                    {t('libs.downloadAll')}
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

            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
                {loading ? (
                    Array.from({ length: 3 }, (_, i) => (
                        <Skeleton key={i} className="h-16 rounded-lg" />
                    ))
                ) : libs.length === 0 ? (
                    <Empty className="h-full">
                        <EmptyHeader>
                            <EmptyTitle>{t('libs.title')}</EmptyTitle>
                            <EmptyDescription>{t('libs.empty')}</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                ) : (
                    libs.map((lib) => (
                        <RemoteLibraryRow
                            key={lib.id}
                            lib={lib}
                            busy={busyIds.has(lib.id)}
                            onDownload={onDownload}
                            onDelete={onDelete}
                            onOpenLocal={onOpenLocal}
                            onOpenWeb={onOpenWeb}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
