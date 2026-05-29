import { events } from '@cion-suite/core/events';
import type { Logger } from '@cion-suite/core/log';
import type { GitVaultSource } from '@shared/types/vault.js';
import type { VaultSyncResult } from '@shared/types/vault-sync.js';
import type { SourceTokens } from './source-tokens.js';
import { listSources } from './sources-store.js';
import { fetchTree, mapGithubError, type RateLimitInfo } from '../utils/github-api.js';
import { parseGithubUrl } from '@shared/utils/github-url.js';
import {
    FONTS_SIDECAR_PATH,
    MANIFEST_VERSION,
    deriveFontsFromTree,
    deriveLibsFromTree,
    derivePresetsFromTree,
    deriveScriptsFromTree,
    manifestToMetas,
    parseFontsSidecar,
    readManifest,
    writeManifest,
    type ManifestFile,
} from './vault-manifest.js';
import { fetchFileContent } from './vault-download.js';
import { installSourceFonts } from './font-install.js';

const SLIDING_TTL_MS = 30_000;

const inFlight = new Map<string, Promise<VaultSyncResult>>();

function emitRateLimit(info: RateLimitInfo | null): void {
    if (!info) return;
    events.emit('vault:rate-limit', info);
}

function emitSynced(sourceId: string, lastSyncedAt: number, fromCache: boolean): void {
    events.emit('vault:source-synced', { sourceId, lastSyncedAt, fromCache });
}

async function buildCachedResult(
    source: GitVaultSource,
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
    // entries forever. Same logic for branch — the cached etag belongs to the
    // previous branch's tree URL; sending it to a new branch can serve stale
    // content if GitHub happens to 304.
    const reusable = existing?.version === MANIFEST_VERSION && existing.branch === branch;
    const etag = reusable ? (existing?.etag ?? null) : null;

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
        // Self-heal even on 304: a font may have been deleted from the user's
        // font dir between syncs, and waiting for the next non-304 sync to
        // reinstall would surprise the user.
        void installSourceFonts(source, { vaultBase, tokens, logger }).catch((err) =>
            logger.warn('post-sync font install failed (304)', { sourceId: source.id, err }),
        );
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

    // Sidecar drives face-name resolution. Only fetch when a blob exists in
    // the tree; otherwise the install service falls back to a normalized
    // filename for the face.
    const hasSidecar = tree.tree.some(
        (e) => e.type === 'blob' && e.path === FONTS_SIDECAR_PATH,
    );
    let sidecarBuf: Buffer | null = null;
    if (hasSidecar) {
        try {
            sidecarBuf = await fetchFileContent(
                source,
                parsed.owner,
                parsed.repo,
                branch,
                FONTS_SIDECAR_PATH,
                tokens,
            );
        } catch (err) {
            logger.warn('vault-sync: fonts sidecar fetch failed', {
                sourceId: source.id,
                err,
            });
        }
    }
    const fonts = deriveFontsFromTree(
        tree.tree,
        parseFontsSidecar(sidecarBuf),
        source.url,
        branch,
    );

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
        fonts,
    };
    await writeManifest(vaultBase, source.id, manifest);

    // Fire-and-forget — sync should not block on font install. Install is
    // idempotent (sha+file-existence check), so calling it on every sync is
    // cheap when nothing changed.
    void installSourceFonts(source, { vaultBase, tokens, logger }).catch((err) =>
        logger.warn('post-sync font install failed', { sourceId: source.id, err }),
    );

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

    const existing = await readManifest(deps.vaultBase, sourceId);
    const branch = source.branch || 'main';
    const ttlFresh =
        existing &&
        existing.version === MANIFEST_VERSION &&
        existing.branch === branch &&
        Date.now() - existing.lastCheckedAt < SLIDING_TTL_MS;
    if (ttlFresh) {
        const built = await buildCachedResult(source, existing, deps.vaultBase, true);
        emitSynced(sourceId, existing.lastSyncedAt, true);
        return built;
    }

    return doSync(source, deps.vaultBase, deps.tokens, deps.logger);
}

// Dedup is intentional within a single sync; if the source's branch flips
// mid-flight, the second caller must NOT share the now-stale promise — so the
// key includes branch. (Token rotation is rare enough to not warrant a key.)
async function inflightKey(sourceId: string, deps: SyncDeps): Promise<string> {
    const sources = await listSources(deps.logger);
    const source = sources.find((s) => s.id === sourceId);
    const branch = source?.branch || 'main';
    return `${sourceId}@${branch}`;
}

export async function syncSource(sourceId: string, deps: SyncDeps): Promise<VaultSyncResult> {
    const key = await inflightKey(sourceId, deps);
    const existing = inFlight.get(key);
    if (existing) return existing;
    const promise = runSync(sourceId, deps).finally(() => {
        inFlight.delete(key);
    });
    inFlight.set(key, promise);
    return promise;
}

export async function syncAllSources(
    deps: SyncDeps,
): Promise<Array<{ sourceId: string; ok: boolean; error?: string }>> {
    const sources = await listSources(deps.logger);
    const results = await Promise.allSettled(
        sources.map((s) => syncSource(s.id, deps).then(() => ({ sourceId: s.id, ok: true }))),
    );
    return results.map((r, i) => {
        const sourceId = sources[i]!.id;
        if (r.status === 'fulfilled') return r.value;
        const message = r.reason instanceof Error ? r.reason.message : String(r.reason);
        return { sourceId, ok: false, error: message };
    });
}
