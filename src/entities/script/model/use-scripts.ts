import { useState, useEffect, useCallback } from 'react';
import { useAppEvent } from '@cion-suite/core/ipc/renderer';
import type { ScriptMeta } from '@shared/types/scripts';

export function useScripts() {
    const [scripts, setScripts] = useState<ScriptMeta[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        const list = (await window.app?.scripts.list()) ?? [];
        setScripts(list);
        setLoading(false);
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    useAppEvent('scripts:changed', () => {
        void refresh();
    });

    useAppEvent('script:status-changed', ({ id, status, errorMessage }) => {
        setScripts((prev) =>
            prev.map((s) => (s.id === id ? { ...s, status, errorMessage } : s)),
        );
    });

    return { scripts, loading, refresh };
}
