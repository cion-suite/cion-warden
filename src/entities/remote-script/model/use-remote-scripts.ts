import { useState, useEffect, useCallback } from 'react';
import type { RemoteScriptMeta } from '@shared/types/get-scripts';

export function useRemoteScripts() {
    const [scripts, setScripts] = useState<RemoteScriptMeta[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        setLoading(true);
        const list = (await window.app?.getScripts.list()) ?? [];
        setScripts(list);
        setLoading(false);
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    return { scripts, loading, refresh };
}
