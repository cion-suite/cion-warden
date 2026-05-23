import { appEvents } from '@cion-suite/core/ipc';
import type { Logger } from '@cion-suite/core/log';
import type { VaultSource, GitVaultSource } from '@shared/types/vault.js';
import type { VaultSyncResult } from '@shared/types/vault-sync.js';
import type { SourceTokens } from './source-tokens.js';
import { listSources } from './sources-store.js';
import { fetchTree, mapGithubError, type RateLimitInfo } from '../utils/github-api.js';
import { parseGithubUrl } from '../utils/github-url.js';
import {
    MANIFEST_VERSION,
    deriveLibsFromTree,
    derivePresetsFromTree,
    deriveScriptsFromTree,
    manifestToMetas,
    readManifest,
    writeManifest,
    type ManifestFile,
} from './vault-manifest.js';

const SLIDING_TTL_MS = 30_000;

const inFlight = new Map<string, Promise<VaultSyncResult>>();

function emitRateLimit(info: RateLimitInfo | null): void {
    if (!info) return;
    appEvents.emit('vault:rate-limit', info);
}

function emitSynced(sourceId: string, lastSyncedAt: number, fromCache: boolean): void {
    appEvents.emit('vault:source-synced', { sourceId, lastSyncedAt, fromCache });
}

async function buildCachedResult(
    source: VaultSource,
    manifest: ManifestFile,
    vaultBase: string,
    fromCache: boolean,
): Promise<VaultSyncResult> {
    const { scripts, libs, presets } = await manifestToMetas(source, manifest, vaultBase);
    return {
        scripts,
        libs,
        presets,
        lastSyncedAt: manifest.lastSyncedAt,
        fromCache,
    };
}

async function doSync(
    source: GitVaultSource,
    vaultBase: string,
    tokens: SourceTokens,
    logger: Logger,
): Promise<VaultSyncResult> {
    const parsed = parseGithubUrl(source.url);
    if (!parsed) throw new Error('Only GitHub repositories are supported');

    const branch = source.branch || 'main';
    const existing = await readManifest(vaultBase, source.id);
    const token = source.isPrivate ? await tokens.getToken(source.id) : null;
    // Bumping MANIFEST_VERSION must force a re-derive: never reuse the cached
    // etag from a stale-shape manifest, otherwise 304 keeps the old (incomplete)
    // entries forever.
    const versionMatch = existing?.version === MANIFEST_VERSION;
    const etag = versionMatch ? (existing?.etag ?? null) : null;

    const result = await fetchTree({
        owner: parsed.owner,
        repo: parsed.repo,
        branch,
        token,
        etag,
    });

    emitRateLimit(result.rateLimit);

    if (result.kind === 'error') {
        logger.warn('vault-sync: tree fetch error', {
            sourceId: source.id,
            status: result.status,
        });
        throw mapGithubError(result.status, source.isPrivate, result.rateLimit);
    }

    const now = Date.now();

    if (result.kind === 'not-modified') {
        if (!existing) {
            throw new Error('vault-sync: 304 without cached manifest');
        }
        const updated: ManifestFile = { ...existing, lastCheckedAt: now };
        await writeManifest(vaultBase, source.id, updated);
        const built = await buildCachedResult(source, updated, vaultBase, true);
        emitSynced(source.id, updated.lastSyncedAt, true);
        return built;
    }

    const { tree } = result;
    if (tree.truncated) {
        logger.warn('vault-sync: tree truncated', { sourceId: source.id });
        throw new Error('vault.treeTruncated');
    }

    const { scripts, cfgs } = deriveScriptsFromTree(tree.tree, source.url, branch);
    const libs = deriveLibsFromTree(tree.tree, source.url, branch);
    const presets = derivePresetsFromTree(tree.tree, source.url, branch);

    const manifest: ManifestFile = {
        version: MANIFEST_VERSION,
        etag: result.etag,
        treeSha: tree.sha,
        branch,
        lastSyncedAt: now,
        lastCheckedAt: now,
        scripts,
        cfgs,
        libs,
        presets,
    };
    await writeManifest(vaultBase, source.id, manifest);

    const built: VaultSyncResult = {
        ...(await buildCachedResult(source, manifest, vaultBase, false)),
        fromCache: false,
        rateLimitRemaining: result.rateLimit?.remaining,
        rateLimitReset: result.rateLimit?.reset,
    };

    emitSynced(source.id, now, false);
    return built;
}

export interface SyncDeps {
    vaultBase: string;
    tokens: SourceTokens;
    logger: Logger;
}

async function runSync(sourceId: string, deps: SyncDeps): Promise<VaultSyncResult> {
    const sources = await listSources(deps.logger);
    const source = sources.find((s) => s.id === sourceId);
    if (!source) throw new Error(`Source not found: ${sourceId}`);
    if (source.type !== 'git') throw new Error('Only git sources support sync');

    const existing = await readManifest(deps.vaultBase, sourceId);
    const ttlFresh =
        existing &&
        existing.version === MANIFEST_VERSION &&
        Date.now() - existing.lastCheckedAt < SLIDING_TTL_MS;
    if (ttlFresh) {
        const built = await buildCachedResult(source, existing, deps.vaultBase, true);
        emitSynced(sourceId, existing.lastSyncedAt, true);
        return built;
    }

    return doSync(source, deps.vaultBase, deps.tokens, deps.logger);
}

export function syncSource(sourceId: string, deps: SyncDeps): Promise<VaultSyncResult> {
    const inflight = inFlight.get(sourceId);
    if (inflight) return inflight;
    const promise = runSync(sourceId, deps).finally(() => {
        inFlight.delete(sourceId);
    });
    inFlight.set(sourceId, promise);
    return promise;
}

export async function syncAllSources(
    deps: SyncDeps,
): Promise<Array<{ sourceId: string; ok: boolean; error?: string }>> {
    const sources = await listSources(deps.logger);
    const gitSources = sources.filter((s): s is GitVaultSource => s.type === 'git');
    const results = await Promise.allSettled(
        gitSources.map((s) => syncSource(s.id, deps).then(() => ({ sourceId: s.id, ok: true }))),
    );
    return results.map((r, i) => {
        const sourceId = gitSources[i]!.id;
        if (r.status === 'fulfilled') return r.value;
        const message = r.reason instanceof Error ? r.reason.message : String(r.reason);
        return { sourceId, ok: false, error: message };
    });
}
