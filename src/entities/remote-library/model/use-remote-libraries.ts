import { useAppEvent } from '@cion-suite/core/ipc/renderer';
import { useAsyncList } from '@/shared/lib/hooks';
import type { RemoteLibraryMeta } from '@shared/types/libs';

export function useRemoteLibraries() {
    const { items, setItems, loading, refresh } = useAsyncList<RemoteLibraryMeta>(
        () => window.app?.libs.list(),
    );

    useAppEvent('vault:source-synced', () => {
        void refresh();
    });

    useAppEvent('libs:changed', () => {
        void refresh();
    });

    return { libs: items, setLibs: setItems, loading, refresh };
}
