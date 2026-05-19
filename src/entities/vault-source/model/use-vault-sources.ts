import { useAsyncList } from '@/shared/lib/hooks';
import type { VaultSource } from '@shared/types/vault';

export function useVaultSources() {
    const { items, loading, refresh } = useAsyncList<VaultSource>(
        () => window.app?.sources.list(),
    );
    return { sources: items, loading, refresh };
}
