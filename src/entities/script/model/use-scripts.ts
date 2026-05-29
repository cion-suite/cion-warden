import { useCallback, useEffect, useState } from 'react';
import { useEvent } from '@cion-suite/core/events/renderer';
import { useAsyncList } from '@/shared/lib/hooks';
import type { ScriptMeta } from '@shared/types/scripts';

export function useScripts() {
    const { items, setItems, loading, refresh } = useAsyncList<ScriptMeta>(
        () => window.app?.scripts.list(),
    );
    const [hasAnyRunning, setHasAnyRunning] = useState(false);

    const probeExternal = useCallback(async () => {
        const result = await window.app?.scripts.probeExternal();
        setHasAnyRunning(result?.anyRunning ?? false);
    }, []);

    useEffect(() => {
        void probeExternal();
    }, [probeExternal]);

    useEvent('scripts:changed', () => {
        void refresh();
        void probeExternal();
    });

    useEvent('script:status-changed', ({ id, status, errorMessage }) => {
        setItems((prev) =>
            prev.map((s) => (s.id === id ? { ...s, status, errorMessage } : s)),
        );
        if (status === 'running') setHasAnyRunning(true);
        else void probeExternal();
    });

    return { scripts: items, loading, refresh, hasAnyRunning, probeExternal };
}
