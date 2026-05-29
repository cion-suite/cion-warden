import { shell } from 'electron';
import { registerHandlers } from '@cion-suite/core/ipc';
import { events } from '@cion-suite/core/events';
import type { RemoteLibraryMeta } from '@shared/types/libs.js';
import type { AppServices } from '../types/services.js';
import { getGlobalVaultPath } from '../services/vault-paths.js';
import { listSources } from '../services/sources-store.js';
import { manifestToMetas, readManifest } from '../services/vault-manifest.js';
import {
    deleteLibLocal,
    downloadAllLibs,
    downloadLib,
    libLocalPath,
    libWebUrl,
} from '../services/vault-download.js';
import { requireString } from '../utils/ipc-args.js';

export interface SourceLibsResult {
    libs: RemoteLibraryMeta[];
    lastSyncedAt?: number;
}

export function registerLibHandlers(services: AppServices): void {
    const { logger, sourceTokens } = services;

    registerHandlers({
        'libs:list': async (): Promise<RemoteLibraryMeta[]> => {
            const sources = await listSources(logger);
            const vaultBase = getGlobalVaultPath();
            const results = await Promise.allSettled(
                sources.map(async (source) => {
                    const manifest = await readManifest(vaultBase, source.id);
                    if (!manifest) return [];
                    const { libs } = await manifestToMetas(source, manifest, vaultBase);
                    return libs;
                }),
            );
            const out: RemoteLibraryMeta[] = [];
            for (let i = 0; i < results.length; i++) {
                const r = results[i]!;
                if (r.status === 'fulfilled') out.push(...r.value);
                else logger.warn('[libs:list] source failed', { sourceId: sources[i]?.id, error: r.reason });
            }
            return out;
        },

        'libs:list-source': async (_event, rawSourceId: unknown): Promise<SourceLibsResult> => {
            const sourceId = requireString(rawSourceId, 'sourceId');
            const sources = await listSources(logger);
            const source = sources.find((s) => s.id === sourceId);
            if (!source) return { libs: [] };
            const vaultBase = getGlobalVaultPath();
            const manifest = await readManifest(vaultBase, sourceId);
            if (!manifest) return { libs: [], lastSyncedAt: undefined };
            const { libs } = await manifestToMetas(source, manifest, vaultBase);
            return { libs, lastSyncedAt: manifest.lastSyncedAt };
        },

        'libs:download': async (_event, rawSourceId: unknown, rawLibId: unknown) => {
            const sourceId = requireString(rawSourceId, 'sourceId');
            const libIdValue = requireString(rawLibId, 'libId');
            const sources = await listSources(logger);
            const source = sources.find((s) => s.id === sourceId);
            if (!source) throw new Error(`Source not found: ${sourceId}`);
            if (source.type !== 'git') throw new Error('Only git sources support download');
            await downloadLib(source, libIdValue, {
                vaultBase: getGlobalVaultPath(),
                tokens: sourceTokens,
                logger,
            });
            events.emit('libs:changed', { sourceId, libId: libIdValue });
        },

        'libs:download-all': async (
            _event,
            rawSourceId: unknown,
        ): Promise<{ ok: number; failed: number }> => {
            if (rawSourceId != null && typeof rawSourceId !== 'string') {
                throw new Error('sourceId must be a string or omitted');
            }
            const sources = await listSources(logger);
            const gitSources = sources.filter((s) => s.type === 'git');
            const targeted =
                rawSourceId == null ? gitSources : gitSources.filter((s) => s.id === rawSourceId);

            const results = await Promise.allSettled(
                targeted.map((source) =>
                    downloadAllLibs(source, {
                        vaultBase: getGlobalVaultPath(),
                        tokens: sourceTokens,
                        logger,
                    }).then((res) => {
                        events.emit('libs:changed', { sourceId: source.id, libId: '*' });
                        return res;
                    }),
                ),
            );

            let ok = 0;
            let failed = 0;
            for (const r of results) {
                if (r.status === 'fulfilled') {
                    ok += r.value.ok;
                    failed += r.value.failed;
                } else {
                    failed++;
                }
            }
            return { ok, failed };
        },

        'libs:delete': async (_event, rawSourceId: unknown, rawLibId: unknown) => {
            const sourceId = requireString(rawSourceId, 'sourceId');
            const libIdValue = requireString(rawLibId, 'libId');
            const sources = await listSources(logger);
            const source = sources.find((s) => s.id === sourceId);
            if (!source) throw new Error(`Source not found: ${sourceId}`);
            if (source.type !== 'git') return;
            await deleteLibLocal(source, libIdValue, {
                vaultBase: getGlobalVaultPath(),
                tokens: sourceTokens,
                logger,
            });
            events.emit('libs:changed', { sourceId, libId: libIdValue });
        },

        'libs:open-local': async (_event, rawSourceId: unknown, rawLibId: unknown) => {
            const sourceId = requireString(rawSourceId, 'sourceId');
            const libIdValue = requireString(rawLibId, 'libId');
            const sources = await listSources(logger);
            const source = sources.find((s) => s.id === sourceId);
            if (!source || source.type !== 'git') return;
            const local = await libLocalPath(source, libIdValue, getGlobalVaultPath());
            if (!local) return;
            shell.showItemInFolder(local);
        },

        'libs:open-web': async (_event, rawSourceId: unknown, rawLibId: unknown) => {
            const sourceId = requireString(rawSourceId, 'sourceId');
            const libIdValue = requireString(rawLibId, 'libId');
            const sources = await listSources(logger);
            const source = sources.find((s) => s.id === sourceId);
            if (!source || source.type !== 'git') return;
            const url = await libWebUrl(source, libIdValue, getGlobalVaultPath());
            if (url) await shell.openExternal(url);
        },
    });
}
