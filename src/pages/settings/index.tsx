import { useState } from 'react';
import { useAppEvent } from '@cion-suite/core/ipc/renderer';
import { useTheme } from 'next-themes';
import { RefreshCwIcon } from 'lucide-react';

import { Badge } from '@/shared/ui/shadcn/badge';
import { Button } from '@/shared/ui/shadcn/button';
import { Card, CardContent } from '@/shared/ui/shadcn/card';
import {
    Field,
    FieldContent,
    FieldDescription,
    FieldGroup,
    FieldLegend,
    FieldSet,
    FieldTitle,
} from '@/shared/ui/shadcn/field';
import { Progress } from '@/shared/ui/shadcn/progress';
import { Skeleton } from '@/shared/ui/shadcn/skeleton';
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
        entry.sourceId === null
            ? t('settings.github.anonymous')
            : entry.sourceName;

    if (!entry.ok || !entry.core) {
        return (
            <Field>
                <div className="flex items-baseline justify-between gap-2">
                    <FieldTitle>{label}</FieldTitle>
                    <Badge variant="outline" className="font-mono shrink-0">
                        {t('error')}
                    </Badge>
                </div>
                <FieldDescription className="text-destructive">
                    {entry.error ?? t('error')}
                </FieldDescription>
            </Field>
        );
    }

    const { used, limit, remaining, reset } = entry.core;
    const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
    const lowRemaining = limit > 0 && remaining / limit < 0.1;

    return (
        <Field>
            <div className="flex items-baseline justify-between gap-2">
                <FieldTitle>{label}</FieldTitle>
                <span className="text-xs font-mono tabular-nums text-muted-foreground shrink-0">
                    {used.toLocaleString()} / {limit.toLocaleString()}
                </span>
            </div>
            <Progress
                value={pct}
                className={cn(
                    'h-2',
                    lowRemaining &&
                        '[&>[data-slot=progress-indicator]]:bg-destructive',
                )}
            />
            <FieldDescription>
                {t('settings.github.remainingResets', {
                    remaining: remaining.toLocaleString(),
                    resetIn: formatResetIn(t, reset),
                })}
            </FieldDescription>
        </Field>
    );
}

export function SettingsPage() {
    const t = useT();
    const { theme, setTheme } = useTheme();
    const locale = useLocale();

    const { supported, checking, check } = useUpdaterCheckForUpdates();
    const githubRateLimit = useGithubRateLimit();
    const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ type: 'idle' });

    useAppEvent('updater:not-available', () => setUpdateStatus({ type: 'up-to-date' }));
    useAppEvent('updater:available', (d) => setUpdateStatus({ type: 'available', version: d.version }));
    useAppEvent('updater:downloaded', (d) => setUpdateStatus({ type: 'downloaded', version: d.version }));

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

    return (
        <div className="mx-auto flex h-full w-full max-w-3xl min-h-0 flex-col">
            <Card className="flex h-full min-h-0 flex-col">
                <CardContent className="scroll-fade min-h-0 flex-1 overflow-y-auto">
                    <FieldGroup>
                        <FieldSet>
                            <FieldLegend>{t('settings.groups.appearance')}</FieldLegend>
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
                        </FieldSet>

                        <FieldSet>
                            <FieldLegend>{t('settings.groups.github')}</FieldLegend>
                            <FieldGroup>
                                <Field orientation="responsive">
                                    <FieldContent>
                                        <FieldTitle>{t('settings.github.title')}</FieldTitle>
                                        <FieldDescription>
                                            {t('settings.github.description')}
                                        </FieldDescription>
                                    </FieldContent>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={githubRateLimit.loading || !githubRateLimit.supported}
                                        onClick={() => void githubRateLimit.refresh()}
                                    >
                                        <RefreshCwIcon
                                            data-icon="inline-start"
                                            className={cn(githubRateLimit.loading && 'animate-spin')}
                                        />
                                        {t('settings.github.refresh')}
                                    </Button>
                                </Field>

                                {githubRateLimit.error && (
                                    <FieldDescription className="text-destructive">
                                        {githubRateLimit.error}
                                    </FieldDescription>
                                )}

                                {!githubRateLimit.data && githubRateLimit.loading && (
                                    <div className="flex flex-col gap-3">
                                        <Skeleton className="h-2 w-full" />
                                        <Skeleton className="h-2 w-full" />
                                    </div>
                                )}

                                {githubRateLimit.data?.entries.map((entry) => (
                                    <RateLimitRow
                                        key={entry.sourceId ?? 'anonymous'}
                                        entry={entry}
                                        t={t}
                                    />
                                ))}
                            </FieldGroup>
                        </FieldSet>

                        <FieldSet>
                            <FieldLegend>{t('settings.groups.updates')}</FieldLegend>
                            <FieldGroup>
                                <Field orientation="responsive">
                                    <FieldContent>
                                        <FieldTitle>{t('settings.updater.currentVersion')}</FieldTitle>
                                        <FieldDescription>
                                            {supported
                                                ? t('settings.updater.description')
                                                : t('settings.updater.unavailable')}
                                        </FieldDescription>
                                    </FieldContent>
                                    <Badge variant="outline" className="font-mono shrink-0">
                                        v{__APP_VERSION__}
                                    </Badge>
                                </Field>

                                {supported && (
                                    <Field orientation="responsive">
                                        <FieldContent>
                                            <FieldTitle>{t('settings.updater.statusLabel')}</FieldTitle>
                                            <FieldDescription>{statusText}</FieldDescription>
                                        </FieldContent>
                                        {updateStatus.type === 'downloaded' ? (
                                            <Button
                                                variant="default"
                                                size="sm"
                                                onClick={() => window.app?.updater.quitAndInstall()}
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
                                                {checking
                                                    ? t('settings.updater.checking')
                                                    : t('settings.updater.checkNow')}
                                            </Button>
                                        )}
                                    </Field>
                                )}
                            </FieldGroup>
                        </FieldSet>
                    </FieldGroup>
                </CardContent>
            </Card>
        </div>
    );
}
