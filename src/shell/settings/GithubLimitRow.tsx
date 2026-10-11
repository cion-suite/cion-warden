import { Badge } from '@/ui/shadcn/badge';
import { Progress } from '@/ui/shadcn/progress';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { resetIn } from './reset-in';
import type { GithubLimitRowProps } from './types';

export function GithubLimitRow({ entry }: GithubLimitRowProps) {
    const t = useT();
    const label = entry.sourceId === null ? t('settings.github.anonymous') : entry.sourceName;

    if (!entry.ok || !entry.core) {
        return (
            <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{label}</span>
                    <Badge variant="outline" className="shrink-0 font-mono">
                        {t('error')}
                    </Badge>
                </div>
                <p className="text-xs text-destructive">{entry.error ?? t('error')}</p>
            </div>
        );
    }

    const { used, limit, remaining, reset } = entry.core;
    const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
    const lowRemaining = limit > 0 && remaining / limit < 0.1;

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{label}</span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {used.toLocaleString()} / {limit.toLocaleString()}
                </span>
            </div>
            <Progress
                value={pct}
                className={cn('h-2', lowRemaining && '[&>[data-slot=progress-indicator]]:bg-destructive')}
            />
            <p className="text-xs text-muted-foreground">
                {t('settings.github.remainingResets', {
                    remaining: remaining.toLocaleString(),
                    resetIn: resetIn(t, reset),
                })}
            </p>
        </div>
    );
}
