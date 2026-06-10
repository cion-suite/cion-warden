import { ipc } from '@cion-suite/core/ipc';
import type { RemoteScriptMeta } from '@shared/types/get-scripts.js';
import type { AppServices } from '../types/services.js';
import { getGlobalVaultPath } from '../services/vault-paths.js';
import { listSources } from '../services/sources-store.js';
import { manifestToMetas, readManifest } from '../services/vault-manifest.js';
import { syncSource } from '../services/vault-sync.js';
import { downloadScript } from '../services/vault-download.js';
import { requireString } from '../utils/ipc-args.js';

export interface SourceScriptsResult {
    scripts: RemoteScriptMeta[];
    lastSyncedAt?: number;
}

export function registerGetScriptHandlers(services: AppServices): void {
    const { logger, sourceTokens } = services;

    ipc.register({
        'get-scripts:list-source': async (_event, rawSourceId: unknown): Promise<SourceScriptsResult> => {
            const sourceId = requireString(rawSourceId, 'sourceId');
            const sources = await listSources(logger);
            const source = sources.find((s) => s.id === sourceId);
            if (!source) return { scripts: [] };

            const vaultBase = getGlobalVaultPath();
            const manifest = await readManifest(vaultBase, sourceId);
            if (!manifest) return { scripts: [], lastSyncedAt: undefined };

            const { scripts } = await manifestToMetas(source, manifest, vaultBase);
            return { scripts, lastSyncedAt: manifest.lastSyncedAt };
        },

        'get-scripts:sync-source': async (
            _event,
            rawSourceId: unknown,
        ): Promise<{ scripts: RemoteScriptMeta[]; lastSyncedAt: number }> => {
            const sourceId = requireString(rawSourceId, 'sourceId');
            const result = await syncSource(sourceId, {
                vaultBase: getGlobalVaultPath(),
                tokens: sourceTokens,
                logger,
            });
            return { scripts: result.scripts, lastSyncedAt: result.lastSyncedAt };
        },

        'get-scripts:list': async (): Promise<RemoteScriptMeta[]> => {
            const sources = await listSources(logger);
            const vaultBase = getGlobalVaultPath();
            const results = await Promise.allSettled(
                sources.map(async (source) => {
                    const manifest = await readManifest(vaultBase, source.id);
                    if (!manifest) return [];
                    const { scripts } = await manifestToMetas(source, manifest, vaultBase);
                    return scripts;
                }),
            );
            const out: RemoteScriptMeta[] = [];
            for (let i = 0; i < results.length; i++) {
                const r = results[i]!;
                if (r.status === 'fulfilled') {
                    out.push(...r.value);
                } else {
                    logger.warn('[get-scripts:list] source failed', { sourceId: sources[i]?.id, error: r.reason });
                }
            }
            return out;
        },

        'get-scripts:download': async (_event, rawSourceId: unknown, rawFileName: unknown) => {
            const sourceId = requireString(rawSourceId, 'sourceId');
            const fileName = requireString(rawFileName, 'fileName');
            const sources = await listSources(logger);
            const source = sources.find((s) => s.id === sourceId);
            if (!source) throw new Error(`Source not found: ${sourceId}`);
            if (source.type !== 'git') throw new Error('Only git sources support download');
            await downloadScript(source, fileName, {
                vaultBase: getGlobalVaultPath(),
                tokens: sourceTokens,
                logger,
            });
        },
    });
}
