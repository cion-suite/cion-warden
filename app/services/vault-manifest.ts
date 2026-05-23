import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { RemoteScriptMeta } from '@shared/types/get-scripts.js';
import type { LibKind, RemoteLibFileEntry, RemoteLibraryMeta } from '@shared/types/libs.js';
import type { RemotePresetMeta } from '@shared/types/binds.js';
import type { VaultSource } from '@shared/types/vault.js';
import { encodeBranchRef, encodeRepoPath } from '../utils/github-api.js';
import { parseGithubUrl } from '../utils/github-url.js';
import { atomicWriteFile } from '../utils/json-file.js';
import { isSafeManifestFileName } from '../utils/shell-safety.js';

export const SCRIPTS_DIR = 'scripts';
export const SCRIPTS_CFG_DIR = 'cfg';
export const LIB_DIR = 'lib';
export const PRESETS_DIR = 'presets';

export const MANIFEST_VERSION = 3;

export interface ManifestScriptEntry {
    fileName: string;
    sha: string;
    downloadUrl: string | null;
}

export interface ManifestCfgEntry {
    fileName: string;
    sha: string;
    downloadUrl: string | null;
}

export interface ManifestLibEntry {
    name: string;
    kind: LibKind;
    path: string;
    sha: string;
    webUrl?: string;
    files: RemoteLibFileEntry[];
}

export interface ManifestPresetEntry {
    fileName: string;
    sha: string;
    downloadUrl: string | null;
}

export interface ManifestFile {
    version: number;
    etag: string | null;
    treeSha: string | null;
    branch: string;
    lastSyncedAt: number;
    lastCheckedAt: number;
    scripts: ManifestScriptEntry[];
    cfgs: ManifestCfgEntry[];
    libs: ManifestLibEntry[];
    presets: ManifestPresetEntry[];
}

interface LocalCacheEntry {
    mtime: number;
    size: number;
    sha: string;
}

export type LocalCache = Record<string, LocalCacheEntry>;

export function manifestPath(vaultBase: string, sourceId: string): string {
    return path.join(vaultBase, sourceId, '.manifest.json');
}

export function localCachePath(vaultBase: string, sourceId: string): string {
    return path.join(vaultBase, sourceId, '.local-cache.json');
}

export function stripExt(fileName: string): string {
    const ext = path.extname(fileName);
    return ext ? fileName.slice(0, -ext.length) : fileName;
}

export function gitBlobSha(content: Buffer): string {
    const hash = crypto.createHash('sha1');
    hash.update(`blob ${content.length}\0`);
    hash.update(content);
    return hash.digest('hex');
}

export async function readManifest(vaultBase: string, sourceId: string): Promise<ManifestFile | null> {
    try {
        const raw = JSON.parse(
            await fs.readFile(manifestPath(vaultBase, sourceId), 'utf-8'),
        ) as Partial<ManifestFile> & { scripts?: ManifestScriptEntry[] };
        return normalizeManifest(raw);
    } catch {
        return null;
    }
}

export async function writeManifest(
    vaultBase: string,
    sourceId: string,
    manifest: ManifestFile,
): Promise<void> {
    await atomicWriteFile(manifestPath(vaultBase, sourceId), JSON.stringify(manifest, null, 2));
}

function normalizeLib(raw: Partial<ManifestLibEntry>): ManifestLibEntry {
    return {
        name: raw.name ?? '',
        kind: raw.kind ?? 'file',
        path: raw.path ?? '',
        sha: raw.sha ?? '',
        webUrl: raw.webUrl,
        files: Array.isArray(raw.files) ? raw.files : [],
    };
}

function normalizeManifest(raw: Partial<ManifestFile> & { scripts?: ManifestScriptEntry[] }): ManifestFile {
    return {
        version: raw.version ?? 1,
        etag: raw.etag ?? null,
        treeSha: raw.treeSha ?? null,
        branch: raw.branch ?? 'main',
        lastSyncedAt: raw.lastSyncedAt ?? 0,
        lastCheckedAt: raw.lastCheckedAt ?? raw.lastSyncedAt ?? 0,
        scripts: raw.scripts ?? [],
        cfgs: raw.cfgs ?? [],
        // Legacy manifests may lack `files` — manifestToMetas iterates it
        // unconditionally, so normalize per entry to avoid TypeError.
        libs: Array.isArray(raw.libs) ? raw.libs.map(normalizeLib) : [],
        presets: raw.presets ?? [],
    };
}

export async function readLocalCache(vaultBase: string, sourceId: string): Promise<LocalCache> {
    try {
        return JSON.parse(
            await fs.readFile(localCachePath(vaultBase, sourceId), 'utf-8'),
        ) as LocalCache;
    } catch {
        return {};
    }
}

export async function writeLocalCache(
    vaultBase: string,
    sourceId: string,
    cache: LocalCache,
): Promise<void> {
    await atomicWriteFile(localCachePath(vaultBase, sourceId), JSON.stringify(cache));
}

export async function resolveLocalSha(
    absPath: string,
    cached: LocalCacheEntry | undefined,
): Promise<LocalCacheEntry | null> {
    let stat;
    try {
        stat = await fs.stat(absPath);
    } catch {
        return null;
    }
    const mtime = stat.mtimeMs;
    const size = stat.size;
    if (cached && cached.mtime === mtime && cached.size === size) return cached;
    const content = await fs.readFile(absPath);
    return { mtime, size, sha: gitBlobSha(content) };
}

function cacheEqual(a: LocalCache, b: LocalCache): boolean {
    const ak = Object.keys(a);
    if (ak.length !== Object.keys(b).length) return false;
    for (const k of ak) {
        const av = a[k];
        const bv = b[k];
        if (!av || !bv || av.mtime !== bv.mtime || av.size !== bv.size || av.sha !== bv.sha) return false;
    }
    return true;
}

export function libId(sourceId: string, name: string): string {
    return `${sourceId}:lib:${name}`;
}

export function presetId(sourceId: string, fileName: string): string {
    return `${sourceId}:preset:${fileName}`;
}

export interface ManifestToMetasResult {
    scripts: RemoteScriptMeta[];
    libs: RemoteLibraryMeta[];
    presets: RemotePresetMeta[];
}

export async function manifestToMetas(
    source: VaultSource,
    manifest: ManifestFile,
    vaultBase: string,
): Promise<ManifestToMetasResult> {
    const sourceRoot = path.join(vaultBase, source.id);
    const cache = await readLocalCache(vaultBase, source.id);
    const nextCache: LocalCache = {};

    const scriptResults = await Promise.all(
        manifest.scripts.map(async (item) => {
            const key = `${SCRIPTS_DIR}/${item.fileName}`;
            const local = await resolveLocalSha(path.join(sourceRoot, key), cache[key]);
            if (local) nextCache[key] = local;
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
            } satisfies RemoteScriptMeta;
        }),
    );

    const libResults = await Promise.all(
        manifest.libs.map(async (lib): Promise<RemoteLibraryMeta> => {
            let isDownloaded = lib.files.length > 0;
            let hasUpdate = false;
            for (const file of lib.files) {
                const key = `${LIB_DIR}/${file.path}`;
                const local = await resolveLocalSha(path.join(sourceRoot, key), cache[key]);
                if (local) nextCache[key] = local;
                if (!local) {
                    isDownloaded = false;
                } else if (local.sha !== file.sha) {
                    hasUpdate = true;
                }
            }
            if (!isDownloaded) hasUpdate = false;
            return {
                id: libId(source.id, lib.name),
                name: lib.name,
                kind: lib.kind,
                path: lib.path,
                sourceId: source.id,
                sourceName: source.name,
                sha: lib.sha,
                isDownloaded,
                hasUpdate,
                webUrl: lib.webUrl,
                files: lib.files,
            };
        }),
    );

    const presetResults = await Promise.all(
        manifest.presets.map(async (item) => {
            const key = `${PRESETS_DIR}/${item.fileName}`;
            const local = await resolveLocalSha(path.join(sourceRoot, key), cache[key]);
            if (local) nextCache[key] = local;
            return {
                id: presetId(source.id, item.fileName),
                name: stripExt(item.fileName),
                fileName: item.fileName,
                sourceId: source.id,
                sourceName: source.name,
                sha: item.sha,
                isDownloaded: local !== null,
                hasUpdate: local !== null && local.sha !== item.sha,
                downloadUrl: item.downloadUrl ?? undefined,
            } satisfies RemotePresetMeta;
        }),
    );

    if (!cacheEqual(cache, nextCache)) {
        await writeLocalCache(vaultBase, source.id, nextCache).catch(() => {});
    }
    return { scripts: scriptResults, libs: libResults, presets: presetResults };
}

export function deriveLibsFromTree(
    treeEntries: Array<{ path: string; type: string; sha: string }>,
    repoUrl?: string,
    branch?: string,
): ManifestLibEntry[] {
    const libRoot = `${LIB_DIR}/`;
    const fileEntries = new Map<string, { path: string; sha: string }>();
    const folderEntries = new Map<string, { sha: string }>();
    const filesPerFolder = new Map<string, RemoteLibFileEntry[]>();

    for (const entry of treeEntries) {
        if (!entry.path.startsWith(libRoot)) continue;
        const rel = entry.path.slice(libRoot.length);
        if (!rel) continue;
        const slash = rel.indexOf('/');
        const top = slash === -1 ? rel : rel.slice(0, slash);

        if (slash === -1) {
            if (entry.type === 'blob') {
                fileEntries.set(rel, { path: rel, sha: entry.sha });
            } else if (entry.type === 'tree') {
                folderEntries.set(top, { sha: entry.sha });
            }
        } else if (entry.type === 'blob') {
            if (!filesPerFolder.has(top)) filesPerFolder.set(top, []);
            filesPerFolder.get(top)!.push({
                path: rel,
                sha: entry.sha,
                downloadUrl: rawUrl(repoUrl, branch, `${libRoot}${rel}`),
            });
            if (!folderEntries.has(top)) folderEntries.set(top, { sha: entry.sha });
        }
    }

    // Detect collision: stripExt(file) === folder name. When both exist, keep the
    // file lib's full filename as its display name to keep ids/keys distinct.
    const folderNames = new Set(folderEntries.keys());
    const libs: ManifestLibEntry[] = [];

    for (const [fileName, file] of fileEntries) {
        const stripped = stripExt(fileName);
        const collides = folderNames.has(stripped);
        const name = collides ? fileName : stripped;
        libs.push({
            name,
            kind: 'file',
            path: file.path,
            sha: file.sha,
            webUrl: blobWebUrl(repoUrl, branch, `${libRoot}${file.path}`),
            files: [
                {
                    path: file.path,
                    sha: file.sha,
                    downloadUrl: rawUrl(repoUrl, branch, `${libRoot}${file.path}`),
                },
            ],
        });
    }

    for (const [folder, info] of folderEntries) {
        libs.push({
            name: folder,
            kind: 'folder',
            path: folder,
            sha: info.sha,
            webUrl: treeWebUrl(repoUrl, branch, `${libRoot}${folder}`),
            files: filesPerFolder.get(folder) ?? [],
        });
    }

    libs.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return libs;
}

export function derivePresetsFromTree(
    treeEntries: Array<{ path: string; type: string; sha: string }>,
    repoUrl?: string,
    branch?: string,
): ManifestPresetEntry[] {
    const prefix = `${PRESETS_DIR}/`;
    const presets: ManifestPresetEntry[] = [];
    for (const entry of treeEntries) {
        if (entry.type !== 'blob') continue;
        if (!entry.path.startsWith(prefix)) continue;
        const rel = entry.path.slice(prefix.length);
        if (rel.includes('/')) continue;
        const lower = rel.toLowerCase();
        if (!lower.endsWith('.json')) continue;
        // `<name>.values.json` is the local user-values convention. If such a
        // file is committed upstream it isn't a preset schema — exclude it so
        // the UI doesn't render a bogus card and `deletePresetLocal` doesn't
        // collide with the sibling schema's values path.
        if (lower.endsWith('.values.json')) continue;
        if (!isSafeManifestFileName(rel)) continue;
        presets.push({
            fileName: rel,
            sha: entry.sha,
            downloadUrl: rawUrl(repoUrl, branch, entry.path),
        });
    }
    presets.sort((a, b) => (a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0));
    return presets;
}

export function deriveScriptsFromTree(
    treeEntries: Array<{ path: string; type: string; sha: string }>,
    repoUrl?: string,
    branch?: string,
): { scripts: ManifestScriptEntry[]; cfgs: ManifestCfgEntry[] } {
    const scriptsPrefix = `${SCRIPTS_DIR}/`;
    const cfgPrefix = `${SCRIPTS_DIR}/${SCRIPTS_CFG_DIR}/`;
    const scripts: ManifestScriptEntry[] = [];
    const cfgs: ManifestCfgEntry[] = [];

    for (const entry of treeEntries) {
        if (entry.type !== 'blob') continue;
        if (entry.path.startsWith(cfgPrefix)) {
            const fileName = entry.path.slice(cfgPrefix.length);
            if (fileName.includes('/')) continue;
            if (!isSafeManifestFileName(fileName)) continue;
            cfgs.push({
                fileName,
                sha: entry.sha,
                downloadUrl: rawUrl(repoUrl, branch, entry.path),
            });
            continue;
        }
        if (!entry.path.startsWith(scriptsPrefix)) continue;
        const rel = entry.path.slice(scriptsPrefix.length);
        if (rel.includes('/')) continue;
        if (!isSafeManifestFileName(rel)) continue;
        scripts.push({
            fileName: rel,
            sha: entry.sha,
            downloadUrl: rawUrl(repoUrl, branch, entry.path),
        });
    }
    scripts.sort((a, b) => (a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0));
    cfgs.sort((a, b) => (a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0));
    return { scripts, cfgs };
}

function parseRepo(repoUrl: string | undefined): { owner: string; repo: string } | null {
    if (!repoUrl) return null;
    return parseGithubUrl(repoUrl);
}

function rawUrl(repoUrl: string | undefined, branch: string | undefined, repoPath: string): string | null {
    const p = parseRepo(repoUrl);
    if (!p || !branch) return null;
    return `https://raw.githubusercontent.com/${p.owner}/${p.repo}/${encodeBranchRef(branch)}/${encodeRepoPath(repoPath)}`;
}

function blobWebUrl(repoUrl: string | undefined, branch: string | undefined, repoPath: string): string | undefined {
    const p = parseRepo(repoUrl);
    if (!p || !branch) return undefined;
    return `https://github.com/${p.owner}/${p.repo}/blob/${encodeBranchRef(branch)}/${encodeRepoPath(repoPath)}`;
}

function treeWebUrl(repoUrl: string | undefined, branch: string | undefined, repoPath: string): string | undefined {
    const p = parseRepo(repoUrl);
    if (!p || !branch) return undefined;
    return `https://github.com/${p.owner}/${p.repo}/tree/${encodeBranchRef(branch)}/${encodeRepoPath(repoPath)}`;
}
