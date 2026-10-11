import {
    CircleCheckIcon,
    DownloadIcon,
    InfoIcon,
    PackageCheckIcon,
    RefreshCwIcon,
    TriangleAlertIcon,
} from 'lucide-react';
import { settings, useSetting } from '@cion-suite/core/renderer';

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/ui/shadcn/alert';
import { Badge } from '@/ui/shadcn/badge';
import { Button } from '@/ui/shadcn/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/shadcn/card';
import {
    Field,
    FieldContent,
    FieldDescription,
    FieldGroup,
    FieldLabel,
    FieldSeparator,
    FieldTitle,
} from '@/ui/shadcn/field';
import { Item, ItemActions, ItemContent, ItemDescription, ItemFooter, ItemMedia, ItemTitle } from '@/ui/shadcn/item';
import { Progress } from '@/ui/shadcn/progress';
import { Spinner } from '@/ui/shadcn/spinner';
import { Switch } from '@/ui/shadcn/switch';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/ui/toast';
import type { StatusView } from './types';
import { useUpdateStatus, type UpdateStatus } from './useUpdateStatus';

export function UpdatesCard() {
    const t = useT();
    const locale = useLocale();
    const beta = useSetting('updaterBeta');
    const { status, refresh } = useUpdateStatus();
    const { isDev } = window.app.env;

    const describe = (current: Exclude<UpdateStatus, { kind: 'failed' }>): StatusView => {
        switch (current.kind) {
            case 'idle':
                return { icon: <RefreshCwIcon />, title: t('settings.updates.status.idle') };
            case 'checking':
                return { icon: <Spinner />, title: t('settings.updates.status.checking') };
            case 'latest': {
                const time = new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(current.checkedAt);
                return {
                    icon: <CircleCheckIcon />,
                    title: t('settings.updates.status.latest'),
                    description: t('settings.updates.status.latestAt', { time }),
                };
            }
            case 'available':
                return {
                    icon: <DownloadIcon />,
                    title: t('settings.updates.status.available', { version: current.version }),
                    description: `${current.percent}%`,
                };
            case 'ready':
                return {
                    icon: <PackageCheckIcon />,
                    title: t('settings.updates.status.ready', { version: current.version }),
                    description: t('settings.updates.status.readyDescription'),
                };
        }
    };

    const renderStatus = () => {
        if (isDev) {
            return (
                <Alert>
                    <InfoIcon />
                    <AlertTitle>{t('settings.updates.status.dev')}</AlertTitle>
                    <AlertDescription>{t('settings.updates.status.devDescription')}</AlertDescription>
                </Alert>
            );
        }
        if (status.kind === 'failed') {
            return (
                <Alert variant="destructive">
                    <TriangleAlertIcon />
                    <AlertTitle>{t('settings.updates.status.failed')}</AlertTitle>
                    <AlertDescription>{status.message}</AlertDescription>
                    <AlertAction>
                        <Button variant="outline" size="xs" onClick={() => void refresh()}>
                            {t('retry')}
                        </Button>
                    </AlertAction>
                </Alert>
            );
        }

        const { icon, title, description } = describe(status);
        const checking = status.kind === 'checking';
        return (
            <Item variant="outline">
                <ItemMedia variant="icon">{icon}</ItemMedia>
                <ItemContent>
                    <ItemTitle>{title}</ItemTitle>
                    {description && <ItemDescription>{description}</ItemDescription>}
                </ItemContent>
                <ItemActions>
                    {status.kind === 'ready' && (
                        <Button
                            size="sm"
                            onClick={() => void toast.result(window.updater.install(), { error: t('updater.failed') })}
                        >
                            {t('settings.updates.restart')}
                        </Button>
                    )}
                    {status.kind !== 'ready' && status.kind !== 'available' && (
                        <Button variant="outline" size="sm" disabled={checking} onClick={() => void refresh()}>
                            {checking ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
                            {t(checking ? 'settings.updates.checking' : 'settings.updates.check')}
                        </Button>
                    )}
                </ItemActions>
                {status.kind === 'available' && (
                    <ItemFooter>
                        <Progress value={status.percent} aria-label={title} />
                    </ItemFooter>
                )}
            </Item>
        );
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('settings.updates.title')}</CardTitle>
                <CardDescription>{t('settings.updates.description')}</CardDescription>
                <CardAction>
                    <Badge variant={beta ? 'default' : 'secondary'}>
                        {t(beta ? 'settings.updates.channel.beta' : 'settings.updates.channel.stable')}
                    </Badge>
                </CardAction>
            </CardHeader>
            <CardContent>
                <FieldGroup>
                    <Field orientation="responsive">
                        <FieldContent>
                            <FieldTitle>{t('settings.updates.version')}</FieldTitle>
                        </FieldContent>
                        <Badge variant="outline" className="shrink-0 font-mono">
                            v{window.app.env.version}
                        </Badge>
                    </Field>
                    <Field orientation="horizontal">
                        <FieldContent>
                            <FieldLabel htmlFor="settings-beta">{t('settings.updates.beta.label')}</FieldLabel>
                            <FieldDescription>{t('settings.updates.beta.description')}</FieldDescription>
                        </FieldContent>
                        <Switch
                            id="settings-beta"
                            checked={beta}
                            onCheckedChange={(checked) => void settings.set('updaterBeta', checked)}
                        />
                    </Field>
                    <FieldSeparator />
                    {renderStatus()}
                </FieldGroup>
            </CardContent>
        </Card>
    );
}
