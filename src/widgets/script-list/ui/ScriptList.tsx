import { RefreshCw } from 'lucide-react';

import { useT } from '@/shared/i18n';
import { Button } from '@/shared/ui/shadcn/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/shadcn/empty';
import { Skeleton } from '@/shared/ui/shadcn/skeleton';
import type { ScriptMeta } from '@shared/types/scripts';
import { ScriptRow } from './ScriptRow';

interface ScriptListProps {
    scripts: ScriptMeta[];
    loading: boolean;
    onRun: (id: string) => Promise<void>;
    onStop: (id: string) => Promise<void>;
    onStopAll: () => Promise<void>;
    onRefresh: () => void;
}

export function ScriptList({
    scripts,
    loading,
    onRun,
    onStop,
    onStopAll,
    onRefresh,
}: ScriptListProps) {
    const t = useT();
    const hasRunning = scripts.some((s) => s.status === 'running');

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="flex shrink-0 items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    disabled={!hasRunning}
                    onClick={() => void onStopAll()}
                >
                    {t('scripts.stopAll')}
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
                    Array.from({ length: 3 }, (_, i) => (
                        <Skeleton key={i} className="h-16 rounded-lg" />
                    ))
                ) : scripts.length === 0 ? (
                    <Empty className="h-full">
                        <EmptyHeader>
                            <EmptyTitle>{t('scripts.title')}</EmptyTitle>
                            <EmptyDescription>{t('scripts.empty')}</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                ) : (
                    scripts.map((script) => (
                        <ScriptRow
                            key={script.id}
                            script={script}
                            onRun={onRun}
                            onStop={onStop}
                            onDeleted={onRefresh}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
