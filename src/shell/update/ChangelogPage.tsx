import { useQuery } from '@tanstack/react-query';
import { errors } from '@cion-suite/core/renderer';
import { CircleAlertIcon, FileTextIcon } from 'lucide-react';

import { PageHeader } from '@/ui/PageHeader';
import { Markdown } from '@/ui/markdown';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/ui/shadcn/alert';
import { Badge } from '@/ui/shadcn/badge';
import { Button } from '@/ui/shadcn/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/ui/shadcn/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/shadcn/empty';
import { Skeleton } from '@/ui/shadcn/skeleton';
import { Spinner } from '@/ui/shadcn/spinner';
import { useT } from '@/lib/i18n';
import { isPrerelease, listChangelog } from './changelog-filter';

const SKELETONS = [0, 1, 2];

export default function ChangelogPage() {
    const t = useT();
    const { version } = window.app.env;
    const { data, error, isPending, isFetching, refetch } = useQuery({
        queryKey: ['updater:changelog:get'],
        queryFn: () => window.updater.changelog.get(),
    });
    const entries = data ? listChangelog(data, version) : [];

    const renderBody = () => {
        if (isPending) {
            return SKELETONS.map((id) => (
                <Card key={id}>
                    <CardHeader>
                        <Skeleton className="h-5 w-28" />
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-4/5" />
                    </CardContent>
                </Card>
            ));
        }
        if (error) {
            return (
                <Alert variant="destructive">
                    <CircleAlertIcon />
                    <AlertTitle>{t('changelog.failed')}</AlertTitle>
                    <AlertDescription>{errors.explain(error).message}</AlertDescription>
                    <AlertAction>
                        <Button variant="outline" size="xs" disabled={isFetching} onClick={() => void refetch()}>
                            {isFetching && <Spinner data-icon="inline-start" />}
                            {t('retry')}
                        </Button>
                    </AlertAction>
                </Alert>
            );
        }
        if (entries.length === 0) {
            return (
                <Empty className="border">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <FileTextIcon />
                        </EmptyMedia>
                        <EmptyTitle>{t('changelog.empty')}</EmptyTitle>
                        <EmptyDescription>{t('changelog.emptyDescription')}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            );
        }
        return entries.map((entry) => {
            const isCurrent = entry.version === version;
            return (
                <Card key={entry.version}>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 font-mono">
                            v{entry.version}
                            {isPrerelease(entry.version) && <Badge variant="outline">{t('changelog.beta')}</Badge>}
                        </CardTitle>
                        {isCurrent && (
                            <CardAction>
                                <Badge>{t('changelog.current')}</Badge>
                            </CardAction>
                        )}
                    </CardHeader>
                    {entry.notes && (
                        <CardContent>
                            <Markdown>{entry.notes}</Markdown>
                        </CardContent>
                    )}
                </Card>
            );
        });
    };

    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            <PageHeader
                title={t('nav.changelog')}
                description={t('changelog.description')}
                actions={
                    <>
                        <Badge variant="outline" className="font-mono">
                            v{version}
                        </Badge>
                        <Badge variant={isPrerelease(version) ? 'default' : 'secondary'}>
                            {t(isPrerelease(version) ? 'changelog.beta' : 'changelog.stable')}
                        </Badge>
                    </>
                }
            />
            {renderBody()}
        </div>
    );
}
