import { useState } from 'react';
import { Plug, RefreshCw } from 'lucide-react';

import { useT } from '@/shared/i18n';
import { toast } from '@/shared/lib/toast';
import { Button } from '@/shared/ui/shadcn/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/shadcn/empty';
import { Skeleton } from '@/shared/ui/shadcn/skeleton';
import type { RemoteScriptMeta } from '@shared/types/get-scripts';
import { RemoteScriptRow } from './RemoteScriptRow';

interface RemoteScriptListProps {
    scripts: RemoteScriptMeta[];
    loading: boolean;
    onRefresh: () => void;
    onSources: () => void;
    onDownload: (script: RemoteScriptMeta) => Promise<void>;
}

export function RemoteScriptList({
    scripts,
    loading,
    onRefresh,
    onSources,
    onDownload,
}: RemoteScriptListProps) {
    const t = useT();
    const [downloadingId, setDownloadingId] = useState<string | null>(null);

    const handleDownload = async (script: RemoteScriptMeta) => {
        setDownloadingId(script.id);
        try {
            await onDownload(script);
        } catch {
            toast.error(t('error'));
        } finally {
            setDownloadingId(null);
        }
    };

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="flex shrink-0 items-center gap-2">
                <Button variant="outline" size="sm" onClick={onSources}>
                    <Plug data-icon="inline-start" />
                    {t('sources.title')}
                </Button>
                <div className="flex-1" />
                <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={onRefresh}
                    title={t('scripts.refresh')}
                >
                    <RefreshCw />
                </Button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
                {loading ? (
                    <>
                        <Skeleton className="h-16 rounded-lg" />
                        <Skeleton className="h-16 rounded-lg" />
                        <Skeleton className="h-16 rounded-lg" />
                    </>
                ) : scripts.length === 0 ? (
                    <div className="flex h-full items-center justify-center">
                        <Empty>
                            <EmptyHeader>
                                <EmptyTitle>{t('getScripts.title')}</EmptyTitle>
                                <EmptyDescription>{t('getScripts.empty')}</EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    </div>
                ) : (
                    scripts.map((script) => (
                        <RemoteScriptRow
                            key={script.id}
                            script={script}
                            downloading={downloadingId === script.id}
                            onDownload={(s) => void handleDownload(s)}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
