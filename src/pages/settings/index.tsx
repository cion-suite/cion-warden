import { useState } from 'react';
import { useEvent } from '@cion-suite/core/events/renderer';
import { useTheme } from 'next-themes';
import { RefreshCwIcon } from 'lucide-react';

import { Badge } from '@/shared/ui/shadcn/badge';
import { Button } from '@/shared/ui/shadcn/button';
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/shared/ui/shadcn/card';
import {
    Field,
    FieldContent,
    FieldDescription,
    FieldGroup,
    FieldTitle,
} from '@/shared/ui/shadcn/field';
import { Progress } from '@/shared/ui/shadcn/progress';
import { Separator } from '@/shared/ui/shadcn/separator';
import { Skeleton } from '@/shared/ui/shadcn/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/shadcn/tabs';
import {
    ToggleGroup,
    ToggleGroupItem,
} from '@/shared/ui/shadcn/toggle-group';
import { cn } from '@/shared/lib/utils';
import { toast } from '@/shared/lib/toast';
import { i18n, SUPPORTED_LOCALES, useLocale, useT } from '@/shared/i18n';
import { useUpdaterCheckForUpdates } from '@/shared/lib/updater';
import { useGithubRateLimit } from '@/shared/lib/github';
import type { GithubRateLimitEntry } from '@shared/types';

const THEMES = ['light', 'dark'] as const;

type UpdateStatus =
    | { type: 'idle' }
    | { type: 'up-to-date' }
    | { type: 'available'; version: string }
    | { type: 'downloaded'; version: string };

type Translate = ReturnType<typeof useT>;

interface RateLimitRowProps {
    entry: GithubRateLimitEntry;
    t: Translate;
}

function formatResetIn(t: Translate, resetUnixSec: number): string {
    const deltaMs = resetUnixSec * 1000 - Date.now();
    if (deltaMs <= 0) return t('settings.github.resetNow');
    const totalSec = Math.floor(deltaMs / 1000);
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return t('settings.github.resetInHours', { hours, minutes: mins });
    }
    if (minutes > 0) return t('settings.github.resetInMinutes', { minutes, seconds });
    return t('settings.github.resetInSeconds', { seconds });
}

function RateLimitRow({ entry, t }: RateLimitRowProps) {
    const label =
        entry.sourceId === null ? t('settings.github.anonymous') : entry.sourceName;

    if (!entry.ok || !entry.core) {
        return (
            <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{label}</span>
                    <Badge variant="outline" className="font-mono shrink-0">
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
                <span className="text-xs font-mono tabular-nums text-muted-foreground shrink-0">
                    {used.toLocaleString()} / {limit.toLocaleString()}
                </span>
            </div>
            <Progress
                value={pct}
                className={cn(
                    'h-2',
                    lowRemaining && '[&>[data-slot=progress-indicator]]:bg-destructive',
                )}
            />
            <p className="text-xs text-muted-foreground">
                {t('settings.github.remainingResets', {
                    remaining: remaining.toLocaleString(),
                    resetIn: formatResetIn(t, reset),
                })}
            </p>
        </div>
    );
}

export function SettingsPage() {
    const t = useT();
    const { theme, setTheme } = useTheme();
    const locale = useLocale();

    const { supported, checking, check } = useUpdaterCheckForUpdates();
    const githubRateLimit = useGithubRateLimit();
    const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ type: 'idle' });

    useEvent('updater:not-available', () => setUpdateStatus({ type: 'up-to-date' }));
    useEvent('updater:available', (d) =>
        setUpdateStatus({ type: 'available', version: d.version }),
    );
    useEvent('updater:downloaded', (d) =>
        setUpdateStatus({ type: 'downloaded', version: d.version }),
    );

    const statusText = checking
        ? t('settings.updater.checking')
        : updateStatus.type === 'up-to-date'
          ? t('settings.updater.statusUpToDate')
          : updateStatus.type === 'available'
            ? t('settings.updater.statusAvailable', { version: updateStatus.version })
            : updateStatus.type === 'downloaded'
              ? t('settings.updater.statusDownloaded', { version: updateStatus.version })
              : t('settings.updater.statusIdle');

    const handleCheckNow = async () => {
        const r = await check();
        if (!r.ok) {
            if ('retryAfter' in r) {
                toast.warning(t('settings.updater.rateLimited', { seconds: r.retryAfter }));
            } else {
                toast.error(r.error ?? t('error'));
            }
        }
    };

    const rateLimitEntries = githubRateLimit.data?.entries ?? [];

    return (
        <div className="mx-auto flex h-full w-full max-w-3xl min-h-0 flex-col">
            <Tabs defaultValue="appearance" className="flex h-full min-h-0 flex-col">
                <TabsList>
                    <TabsTrigger value="appearance">
                        {t('settings.tabs.appearance')}
                    </TabsTrigger>
                    <TabsTrigger value="github">{t('settings.tabs.github')}</TabsTrigger>
                    <TabsTrigger value="updates">{t('settings.tabs.updates')}</TabsTrigger>
                </TabsList>

                <TabsContent value="appearance" className="min-h-0">
                    <Card className="h-full">
                        <CardHeader>
                            <CardTitle>{t('settings.appearance.title')}</CardTitle>
                        </CardHeader>
                        <CardContent className="scroll-fade min-h-0 flex-1 overflow-y-auto">
                            <FieldGroup>
                                <Field orientation="responsive">
                                    <FieldContent>
                                        <FieldTitle>{t('settings.theme.label')}</FieldTitle>
                                        <FieldDescription>
                                            {t('settings.theme.description')}
                                        </FieldDescription>
                                    </FieldContent>
                                    <ToggleGroup
                                        type="single"
                                        variant="outline"
                                        size="sm"
                                        value={theme}
                                        onValueChange={(v) => v && setTheme(v)}
                                    >
                                        {THEMES.map((mode) => (
                                            <ToggleGroupItem key={mode} value={mode}>
                                                {t(`theme.${mode}`)}
                                            </ToggleGroupItem>
                                        ))}
                                    </ToggleGroup>
                                </Field>

                                <Field orientation="responsive">
                                    <FieldContent>
                                        <FieldTitle>{t('settings.locale.label')}</FieldTitle>
                                        <FieldDescription>
                                            {t('settings.locale.description')}
                                        </FieldDescription>
                                    </FieldContent>
                                    <ToggleGroup
                                        type="single"
                                        variant="outline"
                                        size="sm"
                                        value={locale}
                                        onValueChange={(v) =>
                                            v && void i18n.changeLanguage(v)
                                        }
                                    >
                                        {SUPPORTED_LOCALES.map((code) => (
                                            <ToggleGroupItem key={code} value={code}>
                                                {code.toUpperCase()}
                                            </ToggleGroupItem>
                                        ))}
                                    </ToggleGroup>
                                </Field>
                            </FieldGroup>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="github" className="min-h-0">
                    <Card className="h-full">
                        <CardHeader>
                            <CardTitle>{t('settings.groups.github')}</CardTitle>
                            <CardDescription className="text-xs">
                                {t('settings.github.description')}
                            </CardDescription>
                            <CardAction>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={
                                        githubRateLimit.loading || !githubRateLimit.supported
                                    }
                                    onClick={() => void githubRateLimit.refresh()}
                                >
                                    <RefreshCwIcon
                                        data-icon="inline-start"
                                        className={cn(
                                            githubRateLimit.loading && 'animate-spin',
                                        )}
                                    />
                                    {t('settings.github.refresh')}
                                </Button>
                            </CardAction>
                        </CardHeader>
                        <CardContent className="scroll-fade min-h-0 flex-1 overflow-y-auto">
                            {githubRateLimit.error && (
                                <p className="text-xs text-destructive">
                                    {githubRateLimit.error}
                                </p>
                            )}

                            {!githubRateLimit.data && githubRateLimit.loading && (
                                <div className="flex flex-col gap-3">
                                    <Skeleton className="h-2 w-full" />
                                    <Skeleton className="h-2 w-full" />
                                </div>
                            )}

                            {rateLimitEntries.length > 0 && (
                                <div className="flex flex-col">
                                    {rateLimitEntries.map((entry, i) => (
                                        <div key={entry.sourceId ?? 'anonymous'}>
                                            {i > 0 && <Separator className="my-4" />}
                                            <RateLimitRow entry={entry} t={t} />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="updates" className="min-h-0">
                    <Card className="h-full">
                        <CardHeader>
                            <CardTitle>{t('settings.updates.title')}</CardTitle>
                            <CardDescription className="text-xs">
                                {supported
                                    ? t('settings.updates.description')
                                    : t('settings.updater.unavailable')}
                            </CardDescription>
                            {supported && (
                                <CardAction>
                                    {updateStatus.type === 'downloaded' ? (
                                        <Button
                                            variant="default"
                                            size="sm"
                                            onClick={() =>
                                                window.app?.updater.quitAndInstall()
                                            }
                                        >
                                            {t('settings.updater.installNow')}
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={checking}
                                            onClick={() => void handleCheckNow()}
                                        >
                                            <RefreshCwIcon
                                                data-icon="inline-start"
                                                className={cn(checking && 'animate-spin')}
                                            />
                                            {checking
                                                ? t('settings.updater.checking')
                                                : t('settings.updater.checkNow')}
                                        </Button>
                                    )}
                                </CardAction>
                            )}
                        </CardHeader>
                        <CardContent className="scroll-fade min-h-0 flex-1 overflow-y-auto">
                            <FieldGroup>
                                <Field orientation="responsive">
                                    <FieldContent>
                                        <FieldTitle>
                                            {t('settings.updater.currentVersion')}
                                        </FieldTitle>
                                    </FieldContent>
                                    <Badge variant="outline" className="font-mono shrink-0">
                                        v{__APP_VERSION__}
                                    </Badge>
                                </Field>

                                {supported && (
                                    <Field orientation="responsive">
                                        <FieldContent>
                                            <FieldTitle>
                                                {t('settings.updater.statusLabel')}
                                            </FieldTitle>
                                            <FieldDescription>{statusText}</FieldDescription>
                                        </FieldContent>
                                    </Field>
                                )}
                            </FieldGroup>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
