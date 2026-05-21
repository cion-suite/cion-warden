import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { registerHandlers } from '@cion-suite/core/ipc';
import type { RemoteScriptMeta } from '@shared/types/get-scripts.js';
import type { GitVaultSource, VaultSource } from '@shared/types/vault.js';
import type { AppServices } from '../types/services.js';
import type { SourceTokens } from '../services/source-tokens.js';
import { getGlobalVaultPath } from '../services/vault-paths.js';
import { listSources } from '../services/sources-store.js';
import { parseGithubUrl } from '../utils/github-url.js';
import { requireString } from '../utils/ipc-args.js';
import { GITHUB_USER_AGENT, probeRepo } from '../utils/github-api.js';

const SCRIPTS_DIR = 'scripts';

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
    const scriptsDir = path.join(vaultBase, source.id, SCRIPTS_DIR);
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

// ─── GitHub fetch helpers ────────────────────────────────────────────────────

async function buildGitHeaders(
    source: GitVaultSource,
    tokens: SourceTokens,
    accept?: string,
): Promise<Record<string, string>> {
    const headers: Record<string, string> = { 'User-Agent': GITHUB_USER_AGENT };
    if (accept) headers.Accept = accept;
    if (source.isPrivate) {
        const token = await tokens.getToken(source.id);
        if (token) headers.Authorization = `Bearer ${token}`;
    }
    return headers;
}

function mapGithubError(res: Response, isPrivate: boolean): Error {
    if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
        const reset = res.headers.get('x-ratelimit-reset');
        const waitUntil = reset ? new Date(Number(reset) * 1000).toLocaleTimeString() : 'unknown';
        return new Error(`GitHub rate limit exceeded. Resets at ${waitUntil}`);
    }
    if (res.status === 401 || res.status === 403) return new Error('sources.tokenInvalid');
    if (res.status === 404 && isPrivate) return new Error('sources.tokenNoAccess');
    if (res.status === 404) return new Error('sources.repoNotFound');
    return new Error(`GitHub API error: ${res.status} ${res.statusText}`);
}

// ─── GitHub sync ─────────────────────────────────────────────────────────────

async function syncGitSource(
    source: GitVaultSource,
    vaultBase: string,
    tokens: SourceTokens,
): Promise<{ scripts: RemoteScriptMeta[]; lastSyncedAt: number }> {
    const parsed = parseGithubUrl(source.url);
    if (!parsed) throw new Error('Only GitHub repositories are supported');

    const { owner, repo } = parsed;
    const branch = source.branch || 'main';
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${SCRIPTS_DIR}?ref=${encodeURIComponent(branch)}`;
    const headers = await buildGitHeaders(source, tokens, 'application/vnd.github+json');

    const res = await fetch(apiUrl, { headers });
    if (!res.ok) throw mapGithubError(res, source.isPrivate);

    const files = (await res.json()) as GithubFileEntry[];
    if (!Array.isArray(files)) throw new Error('Unexpected response from GitHub API');

    const scriptFiles = files.filter((f) => f.type === 'file');
    const lastSyncedAt = Date.now();

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

async function fetchFileContent(
    source: GitVaultSource,
    owner: string,
    repo: string,
    branch: string,
    repoPath: string,
    tokens: SourceTokens,
): Promise<Buffer | null> {
    if (source.isPrivate) {
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${repoPath}?ref=${encodeURIComponent(branch)}`;
        const headers = await buildGitHeaders(source, tokens, 'application/vnd.github.raw');
        const res = await fetch(url, { headers });
        if (res.status === 404) return null;
        if (!res.ok) throw mapGithubError(res, true);
        return Buffer.from(await res.arrayBuffer());
    }
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${repoPath}`;
    const res = await fetch(url, { headers: { 'User-Agent': GITHUB_USER_AGENT } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
}

// Public download 404 is ambiguous: file deleted OR repo became private/deleted.
// Probe the repo endpoint to disambiguate. Cached briefly because the unauth
// rate limit is 60/hour/IP — repeat clicks shouldn't burn it.
const PUBLIC_REPO_PROBE_TTL_MS = 60_000;
const publicRepoProbeCache = new Map<string, { exists: boolean; at: number }>();

async function probePublicRepoExists(owner: string, repo: string): Promise<boolean> {
    const key = `${owner}/${repo}`;
    const cached = publicRepoProbeCache.get(key);
    if (cached && Date.now() - cached.at < PUBLIC_REPO_PROBE_TTL_MS) return cached.exists;
    try {
        const { ok } = await probeRepo(owner, repo);
        publicRepoProbeCache.set(key, { exists: ok, at: Date.now() });
        return ok;
    } catch {
        return true;
    }
}

async function downloadFromGitSource(
    source: GitVaultSource,
    fileName: string,
    vaultBase: string,
    tokens: SourceTokens,
): Promise<void> {
    const parsed = parseGithubUrl(source.url);
    if (!parsed) throw new Error('Only GitHub repositories are supported');

    const { owner, repo } = parsed;
    const branch = source.branch || 'main';
    const scriptsDir = path.join(vaultBase, source.id, SCRIPTS_DIR);

    const content = await fetchFileContent(
        source,
        owner,
        repo,
        branch,
        `${SCRIPTS_DIR}/${fileName}`,
        tokens,
    );
    if (!content) {
        if (source.isPrivate) throw new Error('sources.tokenNoAccess');
        const repoExists = await probePublicRepoExists(owner, repo);
        if (!repoExists) throw new Error('sources.repoNotFound');
        throw new Error(`Download failed: ${fileName} not found`);
    }

    await fs.mkdir(scriptsDir, { recursive: true });
    await fs.writeFile(path.join(scriptsDir, fileName), content);

    const baseName = stripExt(fileName);
    const cfgContent = await fetchFileContent(
        source,
        owner,
        repo,
        branch,
        `${SCRIPTS_DIR}/cfg/${baseName}.json`,
        tokens,
    ).catch(() => null);
    if (cfgContent) {
        const cfgDir = path.join(scriptsDir, 'cfg');
        await fs.mkdir(cfgDir, { recursive: true });
        await fs.writeFile(path.join(cfgDir, `${baseName}.json`), cfgContent);
    }
}

// ─── Handler registration ────────────────────────────────────────────────────

export function registerGetScriptHandlers(services: AppServices): void {
    const { logger, sourceTokens } = services;

    registerHandlers({
        'get-scripts:list-source': async (_event, rawSourceId: unknown): Promise<SourceScriptsResult> => {
            const sourceId = requireString(rawSourceId, 'sourceId');
            const sources = await listSources(logger);
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
            const sources = await listSources(logger);
            const source = sources.find((s) => s.id === sourceId);
            if (!source) throw new Error(`Source not found: ${sourceId}`);
            if (source.type !== 'git') throw new Error('Only git sources support sync');
            return syncGitSource(source, getGlobalVaultPath(), sourceTokens);
        },

        'get-scripts:list': async (): Promise<RemoteScriptMeta[]> => {
            const sources = await listSources(logger);
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
            await downloadFromGitSource(source, fileName, getGlobalVaultPath(), sourceTokens);
        },
    });
}
