import fs from 'node:fs/promises';
import path from 'node:path';
import type { Logger } from '@cion-suite/core/log';
import type { GitVaultSource } from '@shared/types/vault.js';
import type { SourceTokens } from './source-tokens.js';
import {
    GITHUB_USER_AGENT,
    encodeBranchRef,
    encodeRepoPath,
    fetchWithTimeout,
    mapGithubError,
    probeRepo,
    readRateLimit,
} from '../utils/github-api.js';
import { parseGithubUrl } from '../utils/github-url.js';
import {
    LIB_DIR,
    PRESETS_DIR,
    SCRIPTS_CFG_DIR,
    SCRIPTS_DIR,
    libId as libIdFor,
    manifestToMetas,
    presetId as presetIdFor,
    readManifest,
    stripExt,
    type ManifestLibEntry,
    type ManifestPresetEntry,
} from './vault-manifest.js';

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

async function fetchFileContent(
    source: GitVaultSource,
    owner: string,
    repo: string,
    branch: string,
    repoPath: string,
    tokens: SourceTokens,
): Promise<Buffer | null> {
    if (source.isPrivate) {
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeRepoPath(repoPath)}?ref=${encodeBranchRef(branch)}`;
        const token = await tokens.getToken(source.id);
        const headers: Record<string, string> = {
            'User-Agent': GITHUB_USER_AGENT,
            Accept: 'application/vnd.github.raw',
        };
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetchWithTimeout(url, { headers });
        const rateLimit = readRateLimit(res);
        if (res.status === 404) return null;
        if (!res.ok) throw mapGithubError(res.status, true, rateLimit);
        return Buffer.from(await res.arrayBuffer());
    }
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeBranchRef(branch)}/${encodeRepoPath(repoPath)}`;
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': GITHUB_USER_AGENT } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
}

function assertInside(root: string, child: string): void {
    const rel = path.relative(path.resolve(root), path.resolve(child));
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(`Path escapes vault: ${child}`);
    }
}

export interface DownloadDeps {
    vaultBase: string;
    tokens: SourceTokens;
    logger: Logger;
}

export async function downloadScript(
    source: GitVaultSource,
    fileName: string,
    deps: DownloadDeps,
): Promise<void> {
    const parsed = parseGithubUrl(source.url);
    if (!parsed) throw new Error('Only GitHub repositories are supported');
    const { owner, repo } = parsed;
    const branch = source.branch || 'main';
    const scriptsDir = path.join(deps.vaultBase, source.id, SCRIPTS_DIR);

    const content = await fetchFileContent(source, owner, repo, branch, `${SCRIPTS_DIR}/${fileName}`, deps.tokens);
    if (!content) {
        if (source.isPrivate) throw new Error('sources.tokenNoAccess');
        const repoExists = await probePublicRepoExists(owner, repo);
        if (!repoExists) throw new Error('sources.repoNotFound');
        throw new Error(`Download failed: ${fileName} not found`);
    }

    const dest = path.join(scriptsDir, fileName);
    assertInside(scriptsDir, dest);
    await fs.mkdir(scriptsDir, { recursive: true });
    await fs.writeFile(dest, content);

    const baseName = stripExt(fileName);
    // fetchFileContent already returns null on real 404; a thrown error here
    // is auth/network/rate-limit — log it instead of silently producing
    // a cfg-less script that hides the underlying failure.
    const cfgContent = await fetchFileContent(
        source,
        owner,
        repo,
        branch,
        `${SCRIPTS_DIR}/${SCRIPTS_CFG_DIR}/${baseName}.json`,
        deps.tokens,
    ).catch((err: unknown) => {
        deps.logger.warn('downloadScript: cfg fetch failed', { fileName: baseName, error: err });
        return null;
    });
    if (cfgContent) {
        const cfgDir = path.join(scriptsDir, SCRIPTS_CFG_DIR);
        const cfgDest = path.join(cfgDir, `${baseName}.json`);
        assertInside(cfgDir, cfgDest);
        await fs.mkdir(cfgDir, { recursive: true });
        await fs.writeFile(cfgDest, cfgContent);
    }
}

function findLibInManifest(
    libs: ManifestLibEntry[],
    sourceId: string,
    libIdValue: string,
): ManifestLibEntry | null {
    for (const lib of libs) {
        if (libIdFor(sourceId, lib.name) === libIdValue) return lib;
    }
    return null;
}

export async function downloadLib(
    source: GitVaultSource,
    libIdValue: string,
    deps: DownloadDeps,
): Promise<void> {
    const manifest = await readManifest(deps.vaultBase, source.id);
    if (!manifest) throw new Error('vault.notSynced');
    const lib = findLibInManifest(manifest.libs, source.id, libIdValue);
    if (!lib) throw new Error(`Library not found: ${libIdValue}`);

    const parsed = parseGithubUrl(source.url);
    if (!parsed) throw new Error('Only GitHub repositories are supported');
    const { owner, repo } = parsed;
    const branch = source.branch || 'main';
    const libRoot = path.join(deps.vaultBase, source.id, LIB_DIR);

    for (const file of lib.files) {
        const content = await fetchFileContent(
            source,
            owner,
            repo,
            branch,
            `${LIB_DIR}/${file.path}`,
            deps.tokens,
        );
        if (!content) {
            if (source.isPrivate) throw new Error('sources.tokenNoAccess');
            throw new Error(`Download failed: ${file.path} not found`);
        }
        const dest = path.join(libRoot, file.path);
        assertInside(libRoot, dest);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, content);
    }
}

export async function downloadAllLibs(
    source: GitVaultSource,
    deps: DownloadDeps,
): Promise<{ ok: number; failed: number }> {
    const manifest = await readManifest(deps.vaultBase, source.id);
    if (!manifest) return { ok: 0, failed: 0 };

    let ok = 0;
    let failed = 0;
    for (const lib of manifest.libs) {
        try {
            await downloadLib(source, libIdFor(source.id, lib.name), deps);
            ok++;
        } catch (err) {
            deps.logger.warn('downloadAllLibs: failed', { libName: lib.name, error: err });
            failed++;
        }
    }
    return { ok, failed };
}

export async function deleteLibLocal(
    source: GitVaultSource,
    libIdValue: string,
    deps: DownloadDeps,
): Promise<void> {
    const manifest = await readManifest(deps.vaultBase, source.id);
    if (!manifest) return;
    const lib = findLibInManifest(manifest.libs, source.id, libIdValue);
    if (!lib) return;

    const libRoot = path.join(deps.vaultBase, source.id, LIB_DIR);
    if (lib.kind === 'folder') {
        const target = path.join(libRoot, lib.path);
        assertInside(libRoot, target);
        await fs.rm(target, { recursive: true, force: true });
        return;
    }
    for (const file of lib.files) {
        const target = path.join(libRoot, file.path);
        assertInside(libRoot, target);
        await fs.rm(target, { force: true });
    }
}

function findPresetInManifest(
    presets: ManifestPresetEntry[],
    sourceId: string,
    presetIdValue: string,
): ManifestPresetEntry | null {
    for (const p of presets) {
        if (presetIdFor(sourceId, p.fileName) === presetIdValue) return p;
    }
    return null;
}

export async function downloadPreset(
    source: GitVaultSource,
    presetIdValue: string,
    deps: DownloadDeps,
): Promise<void> {
    const manifest = await readManifest(deps.vaultBase, source.id);
    if (!manifest) throw new Error('vault.notSynced');
    const preset = findPresetInManifest(manifest.presets, source.id, presetIdValue);
    if (!preset) throw new Error(`Preset not found: ${presetIdValue}`);

    const parsed = parseGithubUrl(source.url);
    if (!parsed) throw new Error('Only GitHub repositories are supported');
    const { owner, repo } = parsed;
    const branch = source.branch || 'main';
    const presetsRoot = path.join(deps.vaultBase, source.id, PRESETS_DIR);

    const content = await fetchFileContent(
        source,
        owner,
        repo,
        branch,
        `${PRESETS_DIR}/${preset.fileName}`,
        deps.tokens,
    );
    if (!content) {
        if (source.isPrivate) throw new Error('sources.tokenNoAccess');
        throw new Error(`Download failed: ${preset.fileName} not found`);
    }
    const dest = path.join(presetsRoot, preset.fileName);
    assertInside(presetsRoot, dest);
    await fs.mkdir(presetsRoot, { recursive: true });
    await fs.writeFile(dest, content);
}

export async function downloadAllPresets(
    source: GitVaultSource,
    deps: DownloadDeps,
): Promise<{ ok: number; failed: number }> {
    const manifest = await readManifest(deps.vaultBase, source.id);
    if (!manifest) return { ok: 0, failed: 0 };

    // Skip presets that are already at the manifest SHA — saves a GET per file
    // and conserves the GitHub API quota on private sources.
    const { presets: metas } = await manifestToMetas(source, manifest, deps.vaultBase);
    const upToDate = new Set(metas.filter((m) => m.isDownloaded && !m.hasUpdate).map((m) => m.id));

    let ok = 0;
    let failed = 0;
    for (const preset of manifest.presets) {
        const id = presetIdFor(source.id, preset.fileName);
        if (upToDate.has(id)) continue;
        try {
            await downloadPreset(source, id, deps);
            ok++;
        } catch (err) {
            deps.logger.warn('downloadAllPresets: failed', { fileName: preset.fileName, error: err });
            failed++;
        }
    }
    return { ok, failed };
}

export async function deletePresetLocal(
    source: GitVaultSource,
    presetIdValue: string,
    deps: DownloadDeps,
): Promise<void> {
    const manifest = await readManifest(deps.vaultBase, source.id);
    if (!manifest) return;
    const preset = findPresetInManifest(manifest.presets, source.id, presetIdValue);
    if (!preset) return;

    const presetsRoot = path.join(deps.vaultBase, source.id, PRESETS_DIR);
    const schemaPath = path.join(presetsRoot, preset.fileName);
    const valuesPath = path.join(presetsRoot, `${stripExt(preset.fileName)}.values.json`);
    assertInside(presetsRoot, schemaPath);
    assertInside(presetsRoot, valuesPath);
    await fs.rm(schemaPath, { force: true });
    await fs.rm(valuesPath, { force: true });
}

export async function presetLocalPath(
    source: GitVaultSource,
    presetIdValue: string,
    vaultBase: string,
): Promise<string | null> {
    const manifest = await readManifest(vaultBase, source.id);
    if (!manifest) return null;
    const preset = findPresetInManifest(manifest.presets, source.id, presetIdValue);
    if (!preset) return null;
    return path.join(vaultBase, source.id, PRESETS_DIR, preset.fileName);
}

export async function libLocalPath(
    source: GitVaultSource,
    libIdValue: string,
    vaultBase: string,
): Promise<string | null> {
    const manifest = await readManifest(vaultBase, source.id);
    if (!manifest) return null;
    const lib = findLibInManifest(manifest.libs, source.id, libIdValue);
    if (!lib) return null;
    return path.join(vaultBase, source.id, LIB_DIR, lib.path);
}

export async function libWebUrl(
    source: GitVaultSource,
    libIdValue: string,
    vaultBase: string,
): Promise<string | null> {
    const manifest = await readManifest(vaultBase, source.id);
    if (!manifest) return null;
    const lib = findLibInManifest(manifest.libs, source.id, libIdValue);
    return lib?.webUrl ?? null;
}
