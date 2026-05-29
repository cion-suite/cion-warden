import { useEvent } from '@cion-suite/core/events/renderer';
import { useAsyncList } from '@/shared/lib/hooks';
import type { RemoteLibraryMeta } from '@shared/types/libs';

export function useRemoteLibraries() {
    const { items, setItems, loading, refresh } = useAsyncList<RemoteLibraryMeta>(
        () => window.app?.libs.list(),
    );

    useEvent('vault:source-synced', () => {
        void refresh();
    });

    useEvent('libs:changed', () => {
        void refresh();
    });

    return { libs: items, setLibs: setItems, loading, refresh };
}
