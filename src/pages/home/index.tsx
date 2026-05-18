import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { useAppEvent } from '@cion-suite/core/ipc/renderer';

import { Button } from '@/shared/ui/shadcn/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/shared/ui/shadcn/card';
import { Empty, EmptyDescription, EmptyTitle } from '@/shared/ui/shadcn/empty';
import {
    Field,
    FieldContent,
    FieldDescription,
    FieldGroup,
    FieldTitle,
} from '@/shared/ui/shadcn/field';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/shadcn/tabs';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/shared/ui/shadcn/tooltip';
import { toast } from '@/shared/lib/toast';
import { useUpdaterChannel } from '@/shared/lib/updater';
import { i18n, useLocale, useT } from '@/shared/i18n';
import { cn } from '@/shared/lib/utils';

type Status = 'ok' | 'warn' | 'off';

const STATUS_DOT: Record<Status, string> = {
    ok: 'bg-emerald-500',
    warn: 'bg-amber-500',
    off: 'bg-muted-foreground/40',
};

function StatusDot({ status, className }: { status: Status; className?: string }) {
    return (
        <span
            aria-hidden
            className={cn('size-2 shrink-0 rounded-full', STATUS_DOT[status], className)}
        />
    );
}

type ActivityKey =
    | 'ready'
    | 'themeChanged'
    | 'localeChanged'
    | 'channelChanged';

interface ActivityEntry {
    id: number;
    ts: number;
    key: ActivityKey;
    detail?: string;
}

const ACTIVITY_MAX = 50;

export function HomePage() {
    const t = useT();
    const { theme, resolvedTheme } = useTheme();
    const locale = useLocale();
    const updater = useUpdaterChannel();

    const [readyAt, setReadyAt] = useState<number | null>(null);
    const [activity, setActivity] = useState<ActivityEntry[]>([]);
    const activityIdRef = useRef(0);

    const updaterChannel =
        updater.isBeta === null ? null : updater.isBeta ? 'beta' : 'latest';

    useAppEvent('app:ready', (data) => setReadyAt(data.startedAt));

    useEffect(() => {
        window.app?.signalReady();
    }, []);

    const pushActivity = (key: ActivityKey, detail?: string) => {
        setActivity((prev) =>
            [
                {
                    id: ++activityIdRef.current,
                    ts: Date.now(),
                    key,
                    detail,
                },
                ...prev,
            ].slice(0, ACTIVITY_MAX),
        );
    };

    const prevReadyAt = useRef(readyAt);
    useEffect(() => {
        if (prevReadyAt.current !== readyAt && readyAt !== null) {
            pushActivity('ready', new Date(readyAt).toISOString());
            prevReadyAt.current = readyAt;
        }
    }, [readyAt]);

    const prevTheme = useRef(theme);
    useEffect(() => {
        if (prevTheme.current !== theme) {
            pushActivity('themeChanged', theme);
            prevTheme.current = theme;
        }
    }, [theme]);

    const prevLocale = useRef(locale);
    useEffect(() => {
        if (prevLocale.current !== locale) {
            pushActivity('localeChanged', locale);
            prevLocale.current = locale;
        }
    }, [locale]);

    const prevChannel = useRef(updaterChannel);
    useEffect(() => {
        if (prevChannel.current !== updaterChannel && updaterChannel !== null) {
            pushActivity('channelChanged', updaterChannel);
            prevChannel.current = updaterChannel;
        }
    }, [updaterChannel]);

    return (
        <Tabs
            defaultValue="overview"
            className="mx-auto flex h-full w-full max-w-3xl min-h-0 flex-col"
        >
            <TabsList className="shrink-0">
                <TabsTrigger value="overview">
                    {t('home.tabs.overview')}
                </TabsTrigger>
                <TabsTrigger value="diagnostics">
                    {t('home.tabs.diagnostics')}
                </TabsTrigger>
                <TabsTrigger value="activity">
                    {t('home.tabs.activity')}
                </TabsTrigger>
            </TabsList>

            <TabsContent
                value="overview"
                className="scroll-fade min-h-0 flex-1 overflow-y-auto"
            >
                <OverviewTab
                    readyAt={readyAt}
                    theme={theme}
                    resolvedTheme={resolvedTheme}
                    locale={locale}
                    updaterChannel={updaterChannel}
                    updaterSupported={updater.supported}
                />
            </TabsContent>

            <TabsContent value="diagnostics" className="min-h-0 flex-1">
                <DiagnosticsTab
                    readyAt={readyAt}
                    theme={theme}
                    resolvedTheme={resolvedTheme}
                    locale={locale}
                    updaterChannel={updaterChannel}
                    updaterSupported={updater.supported}
                />
            </TabsContent>

            <TabsContent value="activity" className="min-h-0 flex-1">
                <ActivityTab
                    entries={activity}
                    onClear={() => setActivity([])}
                />
            </TabsContent>
        </Tabs>
    );
}

interface OverviewProps {
    readyAt: number | null;
    theme: string | undefined;
    resolvedTheme: string | undefined;
    locale: string;
    updaterChannel: 'beta' | 'latest' | null;
    updaterSupported: boolean;
}

function OverviewTab({
    readyAt,
    theme,
    resolvedTheme,
    locale,
    updaterChannel,
    updaterSupported,
}: OverviewProps) {
    const t = useT();
    const items: Array<{
        label: string;
        value: string;
        status: Status;
    }> = [
        {
            label: t('home.overview.runtime'),
            value: readyAt
                ? new Date(readyAt).toLocaleTimeString()
                : t('home.overview.runtimeWaiting'),
            status: readyAt ? 'ok' : 'warn',
        },
        {
            label: t('home.overview.theme'),
            value: resolvedTheme ?? theme ?? '—',
            status: 'ok',
        },
        {
            label: t('home.overview.locale'),
            value: locale.toUpperCase(),
            status: 'ok',
        },
        {
            label: t('home.overview.updater'),
            value: updaterSupported ? (updaterChannel ?? '—') : t('home.status.off'),
            status: updaterSupported ? 'ok' : 'off',
        },
    ];

    return (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {items.map((item) => (
                <Card key={item.label} size="sm">
                    <CardHeader>
                        <CardDescription className="flex items-center gap-2">
                            <StatusDot status={item.status} />
                            {item.label}
                        </CardDescription>
                        <CardTitle className="truncate">{item.value}</CardTitle>
                    </CardHeader>
                </Card>
            ))}
        </div>
    );
}

interface DiagnosticsProps {
    readyAt: number | null;
    theme: string | undefined;
    resolvedTheme: string | undefined;
    locale: string;
    updaterChannel: 'beta' | 'latest' | null;
    updaterSupported: boolean;
}

function DiagnosticsTab({
    readyAt,
    theme,
    resolvedTheme,
    locale,
    updaterChannel,
    updaterSupported,
}: DiagnosticsProps) {
    const t = useT();
    return (
        <Card className="flex h-full flex-col">
            <CardContent className="scroll-fade min-h-0 flex-1 overflow-y-auto">
                <FieldGroup>
                    <DiagnosticField
                        title={t('home.runtime.title')}
                        description={t('home.runtime.description')}
                        status={readyAt ? 'ok' : 'warn'}
                        value={
                            readyAt
                                ? new Date(readyAt).toISOString()
                                : t('home.runtime.waiting')
                        }
                    />
                    <DiagnosticField
                        title={t('home.theme.title')}
                        description={t('home.theme.description')}
                        status="ok"
                        value={`${theme ?? '—'} → ${resolvedTheme ?? '—'}`}
                    />
                    <DiagnosticField
                        title={t('home.i18n.title')}
                        description={t('home.i18n.description')}
                        status="ok"
                        value={`${locale} (${Object.keys(i18n.options.resources ?? {}).join(', ')})`}
                    />
                    <DiagnosticField
                        title={t('home.updater.title')}
                        description={t('home.updater.description')}
                        status={updaterSupported ? 'ok' : 'off'}
                        value={
                            updaterSupported
                                ? `${t('home.updater.channel')}: ${updaterChannel ?? '—'}`
                                : t('home.updater.missing')
                        }
                    />
                    <Field orientation="horizontal">
                        <StatusDot status="ok" className="mt-1.5" />
                        <FieldContent>
                            <FieldTitle>{t('home.ui.title')}</FieldTitle>
                            <FieldDescription>
                                {t('home.ui.description')}
                            </FieldDescription>
                        </FieldContent>
                        <div className="flex shrink-0 items-center gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => toast.success(t('home.ui.toast'))}
                            >
                                {t('home.ui.toast')}
                            </Button>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button size="sm" variant="outline">
                                        {t('home.ui.tooltip')}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {t('home.ui.tooltip')} ✓
                                </TooltipContent>
                            </Tooltip>
                        </div>
                    </Field>
                </FieldGroup>
            </CardContent>
        </Card>
    );
}

interface DiagnosticFieldProps {
    title: string;
    description: string;
    status: Status;
    value: string;
}

function DiagnosticField({ title, description, status, value }: DiagnosticFieldProps) {
    return (
        <Field orientation="horizontal">
            <StatusDot status={status} className="mt-1.5" />
            <FieldContent>
                <FieldTitle>{title}</FieldTitle>
                <FieldDescription>{description}</FieldDescription>
            </FieldContent>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {value}
            </span>
        </Field>
    );
}

interface ActivityTabProps {
    entries: ActivityEntry[];
    onClear: () => void;
}

function ActivityTab({ entries, onClear }: ActivityTabProps) {
    const t = useT();
    if (entries.length === 0) {
        return (
            <Empty>
                <EmptyTitle>{t('home.tabs.activity')}</EmptyTitle>
                <EmptyDescription>{t('home.activity.empty')}</EmptyDescription>
            </Empty>
        );
    }
    return (
        <Card className="flex h-full flex-col">
            <CardHeader className="flex shrink-0 flex-row items-center justify-between">
                <CardDescription>{entries.length}</CardDescription>
                <Button variant="ghost" size="sm" onClick={onClear}>
                    {t('home.activity.clear')}
                </Button>
            </CardHeader>
            <CardContent className="scroll-fade min-h-0 flex-1 overflow-y-auto">
                <ul className="flex flex-col gap-2">
                        {entries.map((entry) => (
                            <li
                                key={entry.id}
                                className="flex items-baseline justify-between gap-3 border-b border-border/40 pb-2 last:border-b-0 last:pb-0"
                            >
                                <div className="flex min-w-0 flex-col">
                                    <span className="text-sm">
                                        {t(`home.activity.events.${entry.key}`)}
                                    </span>
                                    {entry.detail && (
                                        <span className="truncate font-mono text-xs text-muted-foreground">
                                            {entry.detail}
                                        </span>
                                    )}
                                </div>
                                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                                    {new Date(entry.ts).toLocaleTimeString()}
                                </span>
                            </li>
                        ))}
                </ul>
            </CardContent>
        </Card>
    );
}
