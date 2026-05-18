import { useState } from 'react';
import { useAppEvent } from '@cion-suite/core/ipc/renderer';
import { useTheme } from 'next-themes';

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
import {
    ToggleGroup,
    ToggleGroupItem,
} from '@/shared/ui/shadcn/toggle-group';
import { toast } from '@/shared/lib/toast';
import { i18n, SUPPORTED_LOCALES, useLocale, useT } from '@/shared/i18n';
import { useUpdaterCheckForUpdates } from '@/shared/lib/updater';

const THEMES = ['light', 'dark'] as const;

type UpdateStatus =
    | { type: 'idle' }
    | { type: 'up-to-date' }
    | { type: 'available'; version: string }
    | { type: 'downloaded'; version: string };

export function SettingsPage() {
    const t = useT();
    const { theme, setTheme } = useTheme();
    const locale = useLocale();

    const { supported, checking, check } = useUpdaterCheckForUpdates();
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
