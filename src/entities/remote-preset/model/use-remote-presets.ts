import { useEvent } from '@cion-suite/core/events/renderer';
import { useAsyncList } from '@/shared/lib/hooks';
import type { RemotePresetMeta } from '@shared/types/binds';

export function useRemotePresets() {
    const { items, setItems, loading, refresh } = useAsyncList<RemotePresetMeta>(
        () => window.app?.binds.list(),
    );

    useEvent('vault:source-synced', () => {
        void refresh();
    });

    useEvent('binds:changed', () => {
        void refresh();
    });

    return { presets: items, setPresets: setItems, loading, refresh };
}
