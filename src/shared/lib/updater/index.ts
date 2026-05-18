import { useEffect, useState } from 'react';
import { useAppEvent } from '@cion-suite/core/ipc/renderer';

import { toast } from '@/shared/lib/toast';
import type { Outcome, UseUpdaterChannel, UseUpdaterCheck } from '@/shared/types/updater';

export function useUpdaterChannel(): UseUpdaterChannel {
    const updater = window.app?.updater;
    const supported = Boolean(updater);
    const [isBeta, setIsBeta] = useState<boolean | null>(null);
    const [loading, setLoading] = useState(supported);

    useEffect(() => {
        if (!updater) {
            setLoading(false);
            return;
        }
        let cancelled = false;
        updater
            .getChannel()
            .then((r) => {
                if (!cancelled) setIsBeta(r.isBeta);
            })
            .catch((e) => {
                console.warn('[updater] getChannel failed', e);
                if (!cancelled) setIsBeta(null);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [updater]);

    useAppEvent('app:channel:changed', (data) => setIsBeta(data.isBeta));

    const setBeta = async (next: boolean): Promise<Outcome> => {
        if (!updater) return { ok: false, error: 'updater bridge not available' };
        let prev: boolean | null = null;
        // Functional updater snapshots latest value; protects against double-click rollback to stale state.
        setIsBeta((curr) => {
            prev = curr;
            return next;
        });
        const r = await updater.setChannel(next);
        if (!r.ok) {
            setIsBeta(prev);
            return { ok: false, error: r.error };
        }
        return { ok: true };
    };

    return { supported, isBeta, loading, setBeta };
}

export function useUpdaterCheckForUpdates(): UseUpdaterCheck {
    const updater = window.app?.updater;
    const supported = Boolean(updater);
    const [checking, setChecking] = useState(false);

    const check = async (): Promise<Outcome> => {
        if (!updater) return { ok: false, error: 'updater bridge not available' };
        setChecking(true);
        try {
            const r = await updater.checkForUpdates();
            if (!r.ok) return { ok: false, error: r.error };
            return { ok: true };
        } finally {
            setChecking(false);
        }
    };

    return { supported, checking, check };
}

export function useUpdaterErrorToast(): void {
    useAppEvent('updater:error', (data) => {
        toast.error(data.message);
    });
}
