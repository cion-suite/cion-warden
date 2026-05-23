import { useEffect, useState } from 'react';
import { useAppEvent } from '@cion-suite/core/ipc/renderer';
import type { GithubRateLimitResult } from '@shared/types';

export interface UseGithubRateLimit {
    supported: boolean;
    loading: boolean;
    data: GithubRateLimitResult | null;
    error: string | null;
    refresh: () => Promise<void>;
}

export function useGithubRateLimit(): UseGithubRateLimit {
    const bridge = window.app?.github;
    const supported = Boolean(bridge);
    const [data, setData] = useState<GithubRateLimitResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = async (): Promise<void> => {
        if (!bridge) return;
        setLoading(true);
        setError(null);
        try {
            setData(await bridge.getRateLimit());
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Vault sync already emits remaining/reset; opportunistic refresh keeps
    // the bars in sync after any sync without an extra click. /rate_limit
    // doesn't consume quota.
    useAppEvent('vault:rate-limit', () => {
        void refresh();
    });

    return { supported, loading, data, error, refresh };
}
