import { useState, useEffect, useCallback } from 'react';
import type { VaultSource } from '@shared/types/vault';

export function useVaultSources() {
    const [sources, setSources] = useState<VaultSource[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        const list = (await window.app?.sources.list()) ?? [];
        setSources(list);
        setLoading(false);
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    return { sources, loading, refresh };
}
