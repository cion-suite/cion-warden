import { useRef, useState } from 'react';
import { useEvent } from '@cion-suite/core/events/renderer';

import { toast } from '@/shared/lib/toast';
import { useT } from '@/shared/i18n';
import type { Outcome, UseUpdaterCheck } from '@/shared/types/updater';

export function useUpdaterCheckForUpdates(): UseUpdaterCheck {
    const updater = window.app?.updater;
    const supported = Boolean(updater);
    const [checking, setChecking] = useState(false);

    const check = async (): Promise<Outcome> => {
        if (!updater) return { ok: false, error: 'updater bridge not available' };
        setChecking(true);
        try {
            const r = await updater.checkForUpdates();
            if (!r.ok) {
                if ('retryAfter' in r) return { ok: false, error: 'rate_limit', retryAfter: r.retryAfter };
                return { ok: false, error: r.error };
            }
            return { ok: true };
        } finally {
            setChecking(false);
        }
    };

    return { supported, checking, check };
}

export function useUpdaterNotifications(): void {
    const t = useT();
    const downloadedVersionRef = useRef<string | null>(null);

    useEvent('updater:error', (data) => {
        toast.error(data.message);
    });

    useEvent('updater:not-available', () => {
        toast.success(t('settings.updater.notAvailable'));
    });

    useEvent('updater:available', (data) => {
        toast.info(t('settings.updater.available', { version: data.version }));
    });

    useEvent('updater:downloaded', (data) => {
        if (downloadedVersionRef.current === data.version) return;
        downloadedVersionRef.current = data.version;
        toast(t('settings.updater.downloaded', { version: data.version }), {
            duration: Infinity,
            action: {
                label: t('settings.updater.install'),
                onClick: () => window.app?.updater.quitAndInstall(),
            },
        });
    });
}
