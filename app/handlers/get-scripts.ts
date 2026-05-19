import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { registerHandlers } from '@cion-suite/core/ipc';
import type { RemoteScriptMeta } from '@shared/types/get-scripts.js';
import type { GitVaultSource, VaultSource } from '@shared/types/vault.js';
import { getGlobalVaultPath } from '../services/vault-paths.js';
import { listSources } from '../services/sources-store.js';
import { parseGithubUrl } from '../utils/github-url.js';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ManifestFile {
    lastSyncedAt: number;
    scripts: Array<{
        fileName: string;
        sha: string;
        downloadUrl: string | null;
    }>;
}

interface GithubFileEntry {
    name: string;
    sha: string;
    download_url: string | null;
    type: string;
}

export interface SourceScriptsResult {
    scripts: RemoteScriptMeta[];
    lastSyncedAt?: number;
}

interface LocalCacheEntry {
    mtime: number;
    size: number;
    sha: string;
}
type LocalCache = Record<string, LocalCacheEntry>;

// ─── Helpers ────────────────────────────────────────────────────────────────

function stripExt(fileName: string): string {
    const ext = path.extname(fileName);
    return ext ? fileName.slice(0, -ext.length) : fileName;
}

function gitBlobSha(content: Buffer): string {
    const hash = crypto.createHash('sha1');
    hash.update(`blob ${content.length}\0`);
    hash.update(content);
    return hash.digest('hex');
}

function manifestPath(vaultBase: string, sourceId: string): string {
    return path.join(vaultBase, sourceId, '.manifest.json');
}

function localCachePath(vaultBase: string, sourceId: string): string {
    return path.join(vaultBase, sourceId, '.local-cache.json');
}

async function readManifest(vaultBase: string, sourceId: string): Promise<ManifestFile | null> {
    try {
        return JSON.parse(
            await fs.readFile(manifestPath(vaultBase, sourceId), 'utf-8'),
        ) as ManifestFile;
    } catch {
        return null;
    }
}

async function readLocalCache(vaultBase: string, sourceId: string): Promise<LocalCache> {
    try {
        return JSON.parse(
            await fs.readFile(localCachePath(vaultBase, sourceId), 'utf-8'),
        ) as LocalCache;
    } catch {
        return {};
    }
}

async function writeLocalCache(vaultBase: string, sourceId: string, cache: LocalCache): Promise<void> {
    const p = localCachePath(vaultBase, sourceId);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, JSON.stringify(cache), 'utf-8');
}

async function resolveLocalSha(
    scriptsDir: string,
    fileName: string,
    cached: LocalCacheEntry | undefined,
): Promise<LocalCacheEntry | null> {
    let stat;
    try {
        stat = await fs.stat(path.join(scriptsDir, fileName));
    } catch {
        return null;
    }
    const mtime = stat.mtimeMs;
    const size = stat.size;
    if (cached && cached.mtime === mtime && cached.size === size) {
        return cached;
    }
    const content = await fs.readFile(path.join(scriptsDir, fileName));
    return { mtime, size, sha: gitBlobSha(content) };
}

async function manifestToScripts(
    source: VaultSource,
    manifest: ManifestFile,
    vaultBase: string,
): Promise<RemoteScriptMeta[]> {
    const scriptsDir = path.join(vaultBase, source.id, 'scripts');
    const cache = await readLocalCache(vaultBase, source.id);
    const nextCache: LocalCache = {};

    const scripts = await Promise.all(
        manifest.scripts.map(async (item) => {
            const local = await resolveLocalSha(scriptsDir, item.fileName, cache[item.fileName]);
            if (local) nextCache[item.fileName] = local;
            return {
                id: `${source.id}:${item.fileName}`,
                name: stripExt(item.fileName),
                fileName: item.fileName,
                sourceId: source.id,
                sourceName: source.name,
                sha: item.sha,
                localSha: local?.sha,
                isDownloaded: local !== null,
                hasUpdate: local !== null && local.sha !== item.sha,
                downloadUrl: item.downloadUrl ?? undefined,
            };
        }),
    );

    if (!cacheEqual(cache, nextCache)) {
        await writeLocalCache(vaultBase, source.id, nextCache).catch(() => {});
    }
    return scripts;
}

function cacheEqual(a: LocalCache, b: LocalCache): boolean {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    for (const k of ak) {
        const av = a[k];
        const bv = b[k];
        if (!av || !bv || av.mtime !== bv.mtime || av.size !== bv.size || av.sha !== bv.sha) return false;
    }
    return true;
}

// ─── GitHub sync ─────────────────────────────────────────────────────────────

async function syncGitSource(
    source: GitVaultSource,
    vaultBase: string,
): Promise<{ scripts: RemoteScriptMeta[]; lastSyncedAt: number }> {
    const parsed = parseGithubUrl(source.url);
    if (!parsed) throw new Error('Only GitHub repositories are supported');

    const { owner, repo } = parsed;
    const branch = source.branch || 'main';
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/scripts?ref=${encodeURIComponent(branch)}`;

    const res = await fetch(apiUrl, {
        headers: { 'User-Agent': 'cion-warden/1.0', Accept: 'application/vnd.github+json' },
    });

    if (res.status === 403 || res.status === 429) {
        const reset = res.headers.get('x-ratelimit-reset');
        const waitUntil = reset ? new Date(Number(reset) * 1000).toLocaleTimeString() : 'unknown';
        throw new Error(`GitHub rate limit exceeded. Resets at ${waitUntil}`);
    }
    if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);

    const files = (await res.json()) as GithubFileEntry[];
    if (!Array.isArray(files)) throw new Error('Unexpected response from GitHub API');

    const scriptFiles = files.filter((f) => f.type === 'file');
    const lastSyncedAt = Date.now();

    // Write manifest (caches remote state — no more API calls until next sync)
    const mPath = manifestPath(vaultBase, source.id);
    await fs.mkdir(path.dirname(mPath), { recursive: true });
    const manifest: ManifestFile = {
        lastSyncedAt,
        scripts: scriptFiles.map((f) => ({
            fileName: f.name,
            sha: f.sha,
            downloadUrl: f.download_url,
        })),
    };
    await fs.writeFile(mPath, JSON.stringify(manifest, null, 2), 'utf-8');

    const scripts = await manifestToScripts(source, manifest, vaultBase);
    return { scripts, lastSyncedAt };
}

// ─── Download ────────────────────────────────────────────────────────────────

async function downloadFromGitSource(
    source: GitVaultSource,
    fileName: string,
    vaultBase: string,
): Promise<void> {
    const parsed = parseGithubUrl(source.url);
    if (!parsed) throw new Error('Only GitHub repositories are supported');

    const { owner, repo } = parsed;
    const branch = source.branch || 'main';
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/scripts/${encodeURIComponent(fileName)}`;

    const res = await fetch(rawUrl, { headers: { 'User-Agent': 'cion-warden/1.0' } });
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);

    const content = Buffer.from(await res.arrayBuffer());
    const scriptsDir = path.join(vaultBase, source.id, 'scripts');
    await fs.mkdir(scriptsDir, { recursive: true });
    await fs.writeFile(path.join(scriptsDir, fileName), content);

    // Also download cfg/<name>.json if it exists (optional)
    try {
        const baseName = stripExt(fileName);
        const cfgUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/scripts/cfg/${encodeURIComponent(baseName)}.json`;
        const cfgRes = await fetch(cfgUrl, { headers: { 'User-Agent': 'cion-warden/1.0' } });
        if (cfgRes.ok) {
            const cfgDir = path.join(scriptsDir, 'cfg');
            await fs.mkdir(cfgDir, { recursive: true });
            await fs.writeFile(path.join(cfgDir, `${baseName}.json`), Buffer.from(await cfgRes.arrayBuffer()));
        }
    } catch {
        // config is optional
    }
}

// ─── Handler registration ────────────────────────────────────────────────────

function requireString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`Invalid ${field}`);
    }
    return value;
}

export function registerGetScriptHandlers(): void {
    registerHandlers({
        'get-scripts:list-source': async (_event, rawSourceId: unknown): Promise<SourceScriptsResult> => {
            const sourceId = requireString(rawSourceId, 'sourceId');
            const sources = await listSources();
            const source = sources.find((s) => s.id === sourceId);
            if (!source) return { scripts: [] };

            const vaultBase = getGlobalVaultPath();
            const manifest = await readManifest(vaultBase, sourceId);
            if (!manifest) return { scripts: [], lastSyncedAt: undefined };

            const scripts = await manifestToScripts(source, manifest, vaultBase);
            return { scripts, lastSyncedAt: manifest.lastSyncedAt };
        },

        'get-scripts:sync-source': async (
            _event,
            rawSourceId: unknown,
        ): Promise<{ scripts: RemoteScriptMeta[]; lastSyncedAt: number }> => {
            const sourceId = requireString(rawSourceId, 'sourceId');
            const sources = await listSources();
            const source = sources.find((s) => s.id === sourceId);
            if (!source) throw new Error(`Source not found: ${sourceId}`);
            if (source.type !== 'git') throw new Error('Only git sources support sync');
            return syncGitSource(source, getGlobalVaultPath());
        },

        'get-scripts:list': async (): Promise<RemoteScriptMeta[]> => {
            const sources = await listSources();
            const vaultBase = getGlobalVaultPath();
            const results = await Promise.allSettled(
                sources.map(async (source) => {
                    const manifest = await readManifest(vaultBase, source.id);
                    if (!manifest) return [];
                    return manifestToScripts(source, manifest, vaultBase);
                }),
            );
            const out: RemoteScriptMeta[] = [];
            for (let i = 0; i < results.length; i++) {
                const r = results[i]!;
                if (r.status === 'fulfilled') {
                    out.push(...r.value);
                } else {
                    console.warn('[get-scripts:list] source failed', sources[i]?.id, r.reason);
                }
            }
            return out;
        },

        'get-scripts:download': async (_event, rawSourceId: unknown, rawFileName: unknown) => {
            const sourceId = requireString(rawSourceId, 'sourceId');
            const fileName = requireString(rawFileName, 'fileName');
            const sources = await listSources();
            const source = sources.find((s) => s.id === sourceId);
            if (!source) throw new Error(`Source not found: ${sourceId}`);
            if (source.type !== 'git') throw new Error('Only git sources support download');
            await downloadFromGitSource(source, fileName, getGlobalVaultPath());
        },
    });
}
