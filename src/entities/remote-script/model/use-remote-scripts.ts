import { useEvent } from '@cion-suite/core/events/renderer';
import { useAsyncList } from '@/shared/lib/hooks';
import type { RemoteScriptMeta } from '@shared/types/get-scripts';

export function useRemoteScripts() {
    const { items, setItems, loading, refresh } = useAsyncList<RemoteScriptMeta>(
        () => window.app?.getScripts.list(),
    );

    useEvent('vault:source-synced', () => {
        void refresh();
    });

    return { scripts: items, setScripts: setItems, loading, refresh };
}
