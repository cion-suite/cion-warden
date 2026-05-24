import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { app } from 'electron';
import type { Logger } from '@cion-suite/core/log';
import type { GitVaultSource, VaultSource } from '@shared/types/vault.js';
import type { FontInstallSummary, InstalledFont } from '@shared/types/assets.js';
import { parseGithubUrl } from '@shared/utils/github-url.js';
import {
    ASSETS_FONTS_DIR,
    fontId,
    gitBlobSha,
    readManifest,
    type ManifestFontEntry,
    type ManifestFile,
} from './vault-manifest.js';
import { fetchFileContent } from './vault-download.js';
import { listSources } from './sources-store.js';
import { atomicWriteFile, readJsonFile } from '../utils/json-file.js';
import type { SourceTokens } from './source-tokens.js';

const REGISTRY_KEY = 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts';
const WM_FONTCHANGE = 0x001d;

export interface FontInstallDeps {
    vaultBase: string;
    tokens: SourceTokens;
    logger: Logger;
}

interface InstalledIndex {
    [assetId: string]: InstalledFont;
}

// Serializes all index reads/writes across the process. Without this, three
// concurrent invocations (startup install, post-sync fire-and-forget, IPC
// reinstall button) race on read-modify-write of installed-fonts.json and
// silently drop entries — orphaning HKCU registry values that uninstall can no
// longer find.
let mutex: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => fn();
    const next = mutex.then(run, run);
    mutex = next.catch(() => undefined);
    return next;
}

function indexPath(): string {
    return path.join(app.getPath('userData'), 'installed-fonts.json');
}

async function readIndex(): Promise<InstalledIndex> {
    return (await readJsonFile<InstalledIndex>(indexPath())) ?? {};
}

async function writeIndex(idx: InstalledIndex): Promise<void> {
    await atomicWriteFile(indexPath(), JSON.stringify(idx, null, 2));
}

function userFontsDir(): string {
    // Callers gated on win32; LOCALAPPDATA is guaranteed.
    return path.join(process.env.LOCALAPPDATA!, 'Microsoft', 'Windows', 'Fonts');
}

// Filename on disk and registry value name both namespace the source id so two
// sources that ship `Arial.ttf` cannot collide in the flat font dir or
// overwrite each other's HKCU entry under the same registry value name.
function destPath(sourceId: string, fileName: string): string {
    return path.join(userFontsDir(), `${sourceId}__${fileName}`);
}

function registrySuffix(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    return ext === '.otf' ? ' (OpenType)' : ' (TrueType)';
}

function makeRegName(sourceId: string, face: string, fileName: string): string {
    return `[${sourceId.slice(0, 8)}] ${face}${registrySuffix(fileName)}`;
}

function regAdd(name: string, fontPath: string): { ok: boolean; stderr: string } {
    const r = spawnSync(
        'reg.exe',
        ['add', REGISTRY_KEY, '/v', name, '/t', 'REG_SZ', '/d', fontPath, '/f'],
        { encoding: 'utf-8' },
    );
    return { ok: r.status === 0, stderr: r.stderr ?? '' };
}

function regDelete(name: string): void {
    spawnSync('reg.exe', ['delete', REGISTRY_KEY, '/v', name, '/f'], { stdio: 'ignore' });
}

function psSingleQuote(s: string): string {
    return s.replace(/'/g, "''");
}

function psArray(paths: string[]): string {
    return paths.map((p) => `  '${psSingleQuote(p)}'`).join(',\n');
}

function buildBroadcastScript(loadPaths: string[], unloadPaths: string[]): string {
    return `Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
public class _FT_ {
  [DllImport("gdi32.dll", CharSet=CharSet.Unicode)] public static extern int AddFontResourceW(string p);
  [DllImport("gdi32.dll", CharSet=CharSet.Unicode)] public static extern int RemoveFontResourceW(string p);
  [DllImport("user32.dll")] public static extern int SendMessageTimeoutA(int hWnd, int msg, int wp, int lp, int flags, int timeout, out int result);
}
'@
$loads = @(
${psArray(loadPaths)}
)
$unloads = @(
${psArray(unloadPaths)}
)
foreach ($p in $loads) { [_FT_]::AddFontResourceW($p) | Out-Null }
foreach ($p in $unloads) { [_FT_]::RemoveFontResourceW($p) | Out-Null }
$o = 0
[_FT_]::SendMessageTimeoutA(-1, ${WM_FONTCHANGE}, 0, 0, 0, 1000, [ref]$o) | Out-Null
`;
}

async function runBroadcast(
    loadPaths: string[],
    unloadPaths: string[],
    logger: Logger,
): Promise<void> {
    if (loadPaths.length === 0 && unloadPaths.length === 0) return;
    await new Promise<void>((resolve) => {
        const child = spawn(
            'powershell',
            [
                '-NoProfile',
                '-ExecutionPolicy',
                'Bypass',
                '-Command',
                buildBroadcastScript(loadPaths, unloadPaths),
            ],
            { stdio: 'ignore', windowsHide: true },
        );
        child.on('exit', () => resolve());
        child.on('error', (err) => {
            logger.warn('font broadcast spawn failed', { err });
            resolve();
        });
    });
}

async function readIfExists(filePath: string): Promise<Buffer | null> {
    try {
        return await fs.readFile(filePath);
    } catch {
        return null;
    }
}

type InstallOutcome =
    | { kind: 'ok'; font: InstalledFont; broadcastLoad: string[]; broadcastUnload: string[] }
    | { kind: 'skipped-missing' } // upstream returned 404 — count as skipped, not failed
    | { kind: 'failed' };

async function installSingleFont(
    source: GitVaultSource,
    owner: string,
    repo: string,
    branch: string,
    entry: ManifestFontEntry,
    prev: InstalledFont | undefined,
    deps: FontInstallDeps,
): Promise<InstallOutcome> {
    const dest = destPath(source.id, entry.fileName);
    const regName = makeRegName(source.id, entry.face, entry.fileName);
    const broadcastLoad: string[] = [];
    const broadcastUnload: string[] = [];

    const existing = await readIfExists(dest);
    const sameContent = !!existing && gitBlobSha(existing) === entry.sha;

    let newlyWritten = false;
    if (!sameContent) {
        const buf = await fetchFileContent(
            source,
            owner,
            repo,
            branch,
            `${ASSETS_FONTS_DIR}/${entry.fileName}`,
            deps.tokens,
        );
        if (!buf) return { kind: 'skipped-missing' };
        await fs.mkdir(path.dirname(dest), { recursive: true });
        try {
            await fs.writeFile(dest, buf);
            newlyWritten = true;
        } catch (err) {
            // Content differs but file is locked by a previous session — user
            // must log out and back in to drop GDI's handle.
            if ((err as NodeJS.ErrnoException).code === 'EBUSY') {
                deps.logger.warn('font file locked, content differs — needs logoff', {
                    fileName: entry.fileName,
                });
                return { kind: 'failed' };
            }
            throw err;
        }
    }

    // Face or filename changed since last install — drop the stale HKCU value
    // before adding the new one so the registry doesn't accumulate duplicate
    // entries for the same source/font.
    if (prev && prev.registryName !== regName) {
        regDelete(prev.registryName);
        broadcastUnload.push(prev.systemPath);
    }
    // Stale file at the previous path (different fileName or pre-namespacing
    // layout) — clean it up so it doesn't linger in user fonts dir.
    if (prev && prev.systemPath !== dest) {
        await fs.rm(prev.systemPath, { force: true }).catch(() => undefined);
    }

    const r = regAdd(regName, dest);
    if (!r.ok) {
        deps.logger.warn('font reg add failed', { fileName: entry.fileName, stderr: r.stderr });
        if (newlyWritten) await fs.rm(dest, { force: true }).catch(() => undefined);
        return { kind: 'failed' };
    }

    const regNameChanged = !prev || prev.registryName !== regName;
    if (newlyWritten || regNameChanged) broadcastLoad.push(dest);

    return {
        kind: 'ok',
        font: {
            assetId: fontId(source.id, entry.fileName),
            sourceId: source.id,
            fileName: entry.fileName,
            face: entry.face,
            sha: entry.sha,
            systemPath: dest,
            registryName: regName,
            installedAt: Date.now(),
        },
        broadcastLoad,
        broadcastUnload,
    };
}

async function installSourceFontsLocked(
    source: VaultSource,
    deps: FontInstallDeps,
): Promise<FontInstallSummary> {
    if (source.type !== 'git') return { ok: 0, failed: 0, skipped: 0 };
    if (process.platform !== 'win32') return { ok: 0, failed: 0, skipped: 0 };

    const manifest: ManifestFile | null = await readManifest(deps.vaultBase, source.id);
    if (!manifest) return { ok: 0, failed: 0, skipped: 0 };
    const parsed = parseGithubUrl(source.url);
    if (!parsed) return { ok: 0, failed: 0, skipped: 0 };
    // manifest.branch is the branch the SHAs were derived from; source.branch
    // can be flipped in the UI before a resync and would yield wrong-branch
    // blobs that don't match the cached SHAs.
    const branch = manifest.branch;

    const index = await readIndex();
    let ok = 0;
    let failed = 0;
    let skipped = 0;
    const loadPaths: string[] = [];
    const unloadPaths: string[] = [];

    for (const entry of manifest.fonts) {
        const id = fontId(source.id, entry.fileName);
        if (entry.skip) {
            skipped++;
            continue;
        }
        const prev = index[id];
        const expectedDest = destPath(source.id, entry.fileName);
        const expectedRegName = makeRegName(source.id, entry.face, entry.fileName);
        if (
            prev &&
            prev.sha === entry.sha &&
            prev.systemPath === expectedDest &&
            prev.registryName === expectedRegName
        ) {
            try {
                await fs.access(prev.systemPath);
                skipped++;
                continue;
            } catch {
                delete index[id];
                await writeIndex(index);
            }
        }

        try {
            const outcome = await installSingleFont(
                source,
                parsed.owner,
                parsed.repo,
                branch,
                entry,
                prev,
                deps,
            );
            if (outcome.kind === 'skipped-missing') {
                skipped++;
                continue;
            }
            if (outcome.kind === 'failed') {
                failed++;
                continue;
            }
            index[id] = outcome.font;
            // Persist per-iteration so a crash between regAdd and end-of-loop
            // can't orphan an HKCU entry that no later uninstall could find.
            await writeIndex(index);
            loadPaths.push(...outcome.broadcastLoad);
            unloadPaths.push(...outcome.broadcastUnload);
            ok++;
        } catch (err) {
            deps.logger.warn('font install failed', { fileName: entry.fileName, err });
            failed++;
        }
    }

    if (loadPaths.length > 0 || unloadPaths.length > 0) {
        await runBroadcast(loadPaths, unloadPaths, deps.logger);
    }
    return { ok, failed, skipped };
}

export function installSourceFonts(
    source: VaultSource,
    deps: FontInstallDeps,
): Promise<FontInstallSummary> {
    return withLock(() => installSourceFontsLocked(source, deps));
}

async function uninstallSourceFontsLocked(
    sourceId: string,
    deps: Pick<FontInstallDeps, 'logger'>,
): Promise<void> {
    if (process.platform !== 'win32') return;
    const index = await readIndex();
    const removedPaths: string[] = [];
    let dirty = false;
    for (const [id, font] of Object.entries(index)) {
        if (font.sourceId !== sourceId) continue;
        // File before registry: if fs.rm fails we keep the index entry so a
        // later retry can still find and reconcile the orphan. Reg-deleting
        // first would leave the file untracked on the user's disk.
        try {
            await fs.rm(font.systemPath, { force: true });
        } catch (err) {
            deps.logger.warn('font file remove failed, keeping index entry', {
                fileName: font.fileName,
                err,
            });
            continue;
        }
        regDelete(font.registryName);
        delete index[id];
        removedPaths.push(font.systemPath);
        dirty = true;
    }
    if (dirty) {
        await writeIndex(index);
        await runBroadcast([], removedPaths, deps.logger);
    }
}

export function uninstallSourceFonts(
    sourceId: string,
    deps: Pick<FontInstallDeps, 'logger'>,
): Promise<void> {
    return withLock(() => uninstallSourceFontsLocked(sourceId, deps));
}

export function listInstalledFonts(): Promise<InstalledFont[]> {
    return withLock(async () => {
        const index = await readIndex();
        return Object.values(index);
    });
}

export async function installAllSourcesFonts(deps: FontInstallDeps): Promise<void> {
    if (process.platform !== 'win32') return;
    const sources = await listSources(deps.logger);
    for (const source of sources) {
        try {
            await installSourceFonts(source, deps);
        } catch (err) {
            deps.logger.warn('installAllSourcesFonts: source failed', {
                sourceId: source.id,
                err,
            });
        }
    }
}
