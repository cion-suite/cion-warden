import type { ReactNode } from 'react';
import { RefreshCwIcon, TriangleAlertIcon } from 'lucide-react';
import { errors } from '@cion-suite/core/renderer';

import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/ui/shadcn/alert';
import { Button } from '@/ui/shadcn/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/ui/shadcn/empty';
import { Skeleton } from '@/ui/shadcn/skeleton';

interface ListPanelProps {
    /** Слева в строке инструментов. */
    toolbar?: ReactNode
    onRefresh: () => void
    refreshing?: boolean
    loading: boolean
    error?: unknown
    onRetry?: () => void
    /** Показывается при count === 0. */
    empty: { title: string; description: string }
    count: number
    layout?: 'list' | 'grid'
    className?: string
    children: ReactNode
}

const LAYOUTS = {
    list: { container: 'flex flex-col gap-2', skeletons: 3, skeleton: 'h-16' },
    grid: {
        container: 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3',
        skeletons: 4,
        skeleton: 'h-24',
    },
} as const;

/** Список: тулбар, обновление, скелетон, ошибка, пустота. */
export function ListPanel({
    toolbar,
    onRefresh,
    refreshing = false,
    loading,
    error,
    onRetry,
    empty,
    count,
    layout = 'list',
    className,
    children,
}: ListPanelProps) {
    const t = useT();
    const { container, skeletons, skeleton } = LAYOUTS[layout];

    const renderBody = () => {
        if (loading) {
            return (
                <div className={container}>
                    {Array.from({ length: skeletons }, (_, i) => (
                        <Skeleton key={i} className={cn('rounded-lg', skeleton)} />
                    ))}
                </div>
            );
        }
        if (error != null) {
            return (
                <Alert variant="destructive">
                    <TriangleAlertIcon />
                    <AlertTitle>{t('error')}</AlertTitle>
                    <AlertDescription>{errors.explain(error).message}</AlertDescription>
                    {onRetry && (
                        <AlertAction>
                            <Button variant="outline" size="xs" onClick={onRetry}>
                                {t('retry')}
                            </Button>
                        </AlertAction>
                    )}
                </Alert>
            );
        }
        if (count === 0) {
            return (
                <Empty className="h-full">
                    <EmptyHeader>
                        <EmptyTitle>{empty.title}</EmptyTitle>
                        <EmptyDescription>{empty.description}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            );
        }
        return <div className={container}>{children}</div>;
    };

    return (
        <div className={cn('mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col gap-3', className)}>
            <div className="flex shrink-0 items-center gap-2">
                {toolbar}
                <div className="flex-1" />
                <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={refreshing}
                    onClick={onRefresh}
                    title={t('scripts.refresh')}
                >
                    <RefreshCwIcon className={cn(refreshing && 'animate-spin')} />
                </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">{renderBody()}</div>
        </div>
    );
}
