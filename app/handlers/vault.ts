import { ipc } from '@cion-suite/core/ipc';
import type { VaultSourceListResult, VaultSyncResult } from '@shared/types/vault-sync.js';
import type { AppServices } from '../types/services.js';
import { getGlobalVaultPath } from '../services/vault-paths.js';
import { listSources } from '../services/sources-store.js';
import { manifestToMetas, readManifest } from '../services/vault-manifest.js';
import { syncAllSources, syncSource } from '../services/vault-sync.js';
import { requireString } from '../utils/ipc-args.js';

export function registerVaultHandlers(services: AppServices): void {
    const { logger, sourceTokens } = services;

    ipc.register({
        'vault:sync-source': async (_event, rawSourceId: unknown): Promise<VaultSyncResult> => {
            const sourceId = requireString(rawSourceId, 'sourceId');
            return syncSource(sourceId, {
                vaultBase: getGlobalVaultPath(),
                tokens: sourceTokens,
                logger,
            });
        },

        'vault:sync-all': async (): Promise<Array<{ sourceId: string; ok: boolean; error?: string }>> =>
            syncAllSources({
                vaultBase: getGlobalVaultPath(),
                tokens: sourceTokens,
                logger,
            }),

        'vault:list-source': async (_event, rawSourceId: unknown): Promise<VaultSourceListResult> => {
            const sourceId = requireString(rawSourceId, 'sourceId');
            const sources = await listSources(logger);
            const source = sources.find((s) => s.id === sourceId);
            if (!source) return { scripts: [], libs: [], presets: [] };
            const vaultBase = getGlobalVaultPath();
            const manifest = await readManifest(vaultBase, sourceId);
            if (!manifest) return { scripts: [], libs: [], presets: [], lastSyncedAt: undefined };
            const { scripts, libs, presets } = await manifestToMetas(source, manifest, vaultBase);
            return { scripts, libs, presets, lastSyncedAt: manifest.lastSyncedAt };
        },
    });
}
