import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { registerHandlers } from '@cion-suite/core/ipc';
import type { RemoteScriptMeta } from '@shared/types/get-scripts.js';
import type { GitVaultSource, VaultSource } from '@shared/types/vault.js';
import { getGlobalVaultPath } from '../services/vault-paths.js';
import { listSources } from '../services/sources-store.js';

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

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseGithubUrl(url: string): { owner: string; repo: string } | null {
    const m = url.match(/github\.com\/([^/]+)\/([^/.\s]+)/);
    if (!m?.[1] || !m[2]) return null;
    return { owner: m[1], repo: m[2].replace(/\.git$/, '') };
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

async function readManifest(vaultBase: string, sourceId: string): Promise<ManifestFile | null> {
    try {
        return JSON.parse(
            await fs.readFile(manifestPath(vaultBase, sourceId), 'utf-8'),
        ) as ManifestFile;
    } catch {
        return null;
    }
}

async function checkLocalFile(
    scriptsDir: string,
    fileName: string,
    remoteSha: string,
): Promise<{ isDownloaded: boolean; hasUpdate: boolean; localSha?: string }> {
    try {
        const content = await fs.readFile(path.join(scriptsDir, fileName));
        const localSha = gitBlobSha(content);
        return { isDownloaded: true, hasUpdate: localSha !== remoteSha, localSha };
    } catch {
        return { isDownloaded: false, hasUpdate: false };
    }
}

async function manifestToScripts(
    source: VaultSource,
    manifest: ManifestFile,
    vaultBase: string,
): Promise<RemoteScriptMeta[]> {
    const scriptsDir = path.join(vaultBase, source.id, 'scripts');
    return Promise.all(
        manifest.scripts.map(async (item) => {
            const ext = path.extname(item.fileName);
            const name = ext ? item.fileName.slice(0, -ext.length) : item.fileName;
            const local = await checkLocalFile(scriptsDir, item.fileName, item.sha);
            return {
                id: `${source.id}:${item.fileName}`,
                name,
                fileName: item.fileName,
                sourceId: source.id,
                sourceName: source.name,
                sha: item.sha,
                localSha: local.localSha,
                isDownloaded: local.isDownloaded,
                hasUpdate: local.hasUpdate,
                downloadUrl: item.downloadUrl ?? undefined,
            };
        }),
    );
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
        const baseName = fileName.replace(/\.[^.]+$/, '');
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

export function registerGetScriptHandlers(): void {
    registerHandlers({
        // List scripts for a single source from cache (no API call)
        'get-scripts:list-source': async (_event, rawSourceId: unknown): Promise<SourceScriptsResult> => {
            const sourceId = String(rawSourceId);
            const sources = await listSources();
            const source = sources.find((s) => s.id === sourceId);
            if (!source) return { scripts: [] };

            const vaultBase = getGlobalVaultPath();
            const manifest = await readManifest(vaultBase, sourceId);
            if (!manifest) return { scripts: [], lastSyncedAt: undefined };

            const scripts = await manifestToScripts(source, manifest, vaultBase);
            return { scripts, lastSyncedAt: manifest.lastSyncedAt };
        },

        // Sync a single source: hits GitHub API, writes manifest, returns fresh data
        'get-scripts:sync-source': async (
            _event,
            rawSourceId: unknown,
        ): Promise<{ scripts: RemoteScriptMeta[]; lastSyncedAt: number }> => {
            const sourceId = String(rawSourceId);
            const sources = await listSources();
            const source = sources.find((s) => s.id === sourceId);
            if (!source) throw new Error(`Source not found: ${sourceId}`);
            if (source.type !== 'git') throw new Error('Only git sources support sync');
            return syncGitSource(source, getGlobalVaultPath());
        },

        // Aggregate list from all source caches (no API calls)
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
            return results
                .filter(
                    (r): r is PromiseFulfilledResult<RemoteScriptMeta[]> =>
                        r.status === 'fulfilled',
                )
                .flatMap((r) => r.value);
        },

        'get-scripts:download': async (_event, rawSourceId: unknown, rawFileName: unknown) => {
            const sourceId = String(rawSourceId);
            const fileName = String(rawFileName);
            const sources = await listSources();
            const source = sources.find((s) => s.id === sourceId);
            if (!source) throw new Error(`Source not found: ${sourceId}`);
            if (source.type !== 'git') throw new Error('Only git sources support download');
            await downloadFromGitSource(source, fileName, getGlobalVaultPath());
        },

        'get-scripts:sync': async () => {
            // Legacy no-op — use sync-source per source instead
        },
    });
}
