import { useAppEvent } from '@cion-suite/core/ipc/renderer';
import { useAsyncList } from '@/shared/lib/hooks';
import type { ScriptMeta } from '@shared/types/scripts';

export function useScripts() {
    const { items, setItems, loading, refresh } = useAsyncList<ScriptMeta>(
        () => window.app?.scripts.list(),
    );

    useAppEvent('scripts:changed', () => {
        void refresh();
    });

    useAppEvent('script:status-changed', ({ id, status, errorMessage }) => {
        setItems((prev) =>
            prev.map((s) => (s.id === id ? { ...s, status, errorMessage } : s)),
        );
    });

    return { scripts: items, loading, refresh };
}
