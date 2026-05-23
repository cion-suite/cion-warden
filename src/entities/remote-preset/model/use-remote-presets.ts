import { useAppEvent } from '@cion-suite/core/ipc/renderer';
import { useAsyncList } from '@/shared/lib/hooks';
import type { RemotePresetMeta } from '@shared/types/binds';

export function useRemotePresets() {
    const { items, setItems, loading, refresh } = useAsyncList<RemotePresetMeta>(
        () => window.app?.binds.list(),
    );

    useAppEvent('vault:source-synced', () => {
        void refresh();
    });

    useAppEvent('binds:changed', () => {
        void refresh();
    });

    return { presets: items, setPresets: setItems, loading, refresh };
}
