import { Fragment } from 'react';
import { RefreshCwIcon } from 'lucide-react';
import { errors } from '@cion-suite/core/renderer';

import { Button } from '@/ui/shadcn/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/shadcn/card';
import { Separator } from '@/ui/shadcn/separator';
import { Skeleton } from '@/ui/shadcn/skeleton';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { GithubLimitRow } from './GithubLimitRow';
import { useGithubLimit } from './useGithubLimit';

export function GithubCard() {
    const t = useT();
    const { entries, isPending, isFetching, error, refetch } = useGithubLimit();

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('settings.github.title')}</CardTitle>
                <CardDescription>{t('settings.github.description')}</CardDescription>
                <CardAction>
                    <Button variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>
                        <RefreshCwIcon data-icon="inline-start" className={cn(isFetching && 'animate-spin')} />
                        {t('settings.github.refresh')}
                    </Button>
                </CardAction>
            </CardHeader>
            <CardContent>
                {error && <p className="text-xs text-destructive">{errors.explain(error).message}</p>}

                {isPending && (
                    <div className="flex flex-col gap-3">
                        <Skeleton className="h-2 w-full" />
                        <Skeleton className="h-2 w-full" />
                    </div>
                )}

                {entries.length > 0 && (
                    <div className="flex flex-col">
                        {entries.map((entry, i) => (
                            <Fragment key={entry.sourceId ?? 'anonymous'}>
                                {i > 0 && <Separator className="my-4" />}
                                <GithubLimitRow entry={entry} />
                            </Fragment>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
