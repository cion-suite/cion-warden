import { registerHandlers } from '@cion-suite/core/ipc';
import type { VaultSource } from '@shared/types/vault.js';
import { listSources, addSource, removeSource, updateSource } from '../services/sources-store.js';

export function registerSourceHandlers(): void {
    registerHandlers({
        'sources:list': () => listSources(),

        'sources:add': (_event, rawData: unknown) =>
            addSource(rawData as Omit<VaultSource, 'id'>),

        'sources:remove': (_event, rawId: unknown) =>
            removeSource(String(rawId)),

        'sources:update': (_event, rawId: unknown, rawPatch: unknown) =>
            updateSource(String(rawId), rawPatch as Record<string, unknown>),
    });
}
