import fs from 'node:fs/promises';
import path from 'node:path';
import type { Logger } from '@cion-suite/core/log';
import type { VaultSource } from '@shared/types/vault.js';
import type {
    DepsCheckResult,
    MissingLib,
    MissingPreset,
} from '@shared/types/script-deps.js';
import { parseGithubUrl } from '@shared/utils/github-url.js';
import { parseAhkIncludes } from '../utils/ahk-includes.js';
import {
    LIB_DIR,
    PRESETS_DIR,
    libId as libIdFor,
    presetId as presetIdFor,
    readManifest,
    stripExt,
    type ManifestLibEntry,
    type ManifestPresetEntry,
} from './vault-manifest.js';
import { fetchFileContent } from './vault-download.js';
import type { SourceTokens } from './source-tokens.js';

export interface DepsCheckDeps {
    tokens: SourceTokens;
    logger: Logger;
    vaultBase: string;
}

export async function checkScriptDeps(
    scriptPath: string,
    source: VaultSource,
    deps: DepsCheckDeps,
): Promise<DepsCheckResult> {
    if (source.type !== 'git') return { missing: [], unknown: [] };
    const manifest = await readManifest(deps.vaultBase, source.id);
    if (!manifest) return { missing: [], unknown: [] };

    const parsed = parseGithubUrl(source.url);
    if (!parsed) return { missing: [], unknown: [] };
    const branch = source.branch || 'main';

    const sourceRoot = path.join(deps.vaultBase, source.id);

    let scriptContent: string;
    try {
        scriptContent = await fs.readFile(scriptPath, 'utf-8');
    } catch (err) {
        deps.logger.warn('checkScriptDeps: read script failed', { scriptPath, err });
        return { missing: [], unknown: [] };
    }

    const libResult = await resolveLibs(scriptContent, source, parsed.owner, parsed.repo, branch, manifest.libs, sourceRoot, deps);

    // #Include parser only catches `#Include lib\foo.ahk` directives. Scripts
    // can also load lib files at runtime (e.g. `Cfg.FromFile(A_ScriptDir "\..\lib\foo.json")`),
    // which #Include doesn't see. The text scan below catches those by
    // matching file basenames against the script text. Same idea is used for
    // presets, which are never referenced via #Include.
    const extraLibs = await scanLibFilenames(
        scriptContent,
        manifest.libs,
        sourceRoot,
        source.id,
        libResult.touched,
    );
    const missingPresets = await resolveMissingPresets(scriptContent, manifest.presets, sourceRoot, source.id);

    return {
        missing: [...libResult.missing, ...extraLibs, ...missingPresets],
        unknown: libResult.unknown,
    };
}

interface LibResolveResult {
    missing: MissingLib[];
    unknown: string[];
    // Lib names already handled by #Include BFS — used by the filename scan to
    // avoid emitting duplicates for libs already in `missing` or confirmed on disk.
    touched: Set<string>;
}

async function resolveLibs(
    scriptContent: string,
    source: VaultSource,
    owner: string,
    repo: string,
    branch: string,
    libs: ManifestLibEntry[],
    sourceRoot: string,
    deps: DepsCheckDeps,
): Promise<LibResolveResult> {
    const libIndex = buildLibIndex(libs);

    const visited = new Set<string>();
    const missing = new Map<string, ManifestLibEntry>();
    const unknown = new Set<string>();
    const queue: string[] = [scriptContent];

    while (queue.length > 0) {
        const content = queue.shift()!;
        for (const inc of parseAhkIncludes(content)) {
            const key = normalizeIncludeKey(inc);
            if (!key) continue;
            const lib = libIndex.get(key);
            if (!lib) {
                unknown.add(inc);
                continue;
            }
            if (visited.has(lib.name)) continue;
            visited.add(lib.name);

            const contents = await readLibFromDisk(sourceRoot, lib);
            if (contents) {
                for (const c of contents) queue.push(c);
                continue;
            }

            missing.set(lib.name, lib);
            const fetched = await fetchLibForParse(source, owner, repo, branch, lib, deps);
            for (const c of fetched) queue.push(c);
        }
    }

    return {
        missing: Array.from(missing.values()).map((lib) => ({
            kind: 'lib',
            sourceId: source.id,
            libId: libIdFor(source.id, lib.name),
            name: lib.name,
        })),
        unknown: Array.from(unknown),
        touched: visited,
    };
}

const MIN_BASENAME_LEN = 4;

async function scanLibFilenames(
    scriptContent: string,
    libs: ManifestLibEntry[],
    sourceRoot: string,
    sourceId: string,
    touched: Set<string>,
): Promise<MissingLib[]> {
    if (libs.length === 0) return [];
    const haystack = scriptContent.toLowerCase();
    const out: MissingLib[] = [];
    for (const lib of libs) {
        if (touched.has(lib.name)) continue;
        let referenced = false;
        for (const file of lib.files) {
            const base = path.basename(file.path).toLowerCase();
            if (base.length < MIN_BASENAME_LEN) continue;
            if (haystack.includes(base)) {
                referenced = true;
                break;
            }
        }
        if (!referenced) continue;
        const contents = await readLibFromDisk(sourceRoot, lib);
        if (contents) continue;
        out.push({
            kind: 'lib',
            sourceId,
            libId: libIdFor(sourceId, lib.name),
            name: lib.name,
        });
    }
    return out;
}

// Preset detection — manifest defines the candidate names; we only download a
// preset if its filename is referenced verbatim by the script. Lowercase
// compare to be forgiving about casing in `MyPreset.json` vs `mypreset.json`.
async function resolveMissingPresets(
    scriptContent: string,
    presets: ManifestPresetEntry[],
    sourceRoot: string,
    sourceId: string,
): Promise<MissingPreset[]> {
    if (presets.length === 0) return [];
    const haystack = scriptContent.toLowerCase();
    const out: MissingPreset[] = [];
    for (const p of presets) {
        const needle = p.fileName.toLowerCase();
        if (!haystack.includes(needle)) continue;
        const abs = path.join(sourceRoot, PRESETS_DIR, p.fileName);
        try {
            await fs.access(abs);
            continue;
        } catch {
            // missing — flag for download
        }
        out.push({
            kind: 'preset',
            sourceId,
            presetId: presetIdFor(sourceId, p.fileName),
            name: stripExt(p.fileName),
        });
    }
    return out;
}

function buildLibIndex(libs: ManifestLibEntry[]): Map<string, ManifestLibEntry> {
    const idx = new Map<string, ManifestLibEntry>();
    for (const lib of libs) {
        for (const file of lib.files) {
            idx.set(file.path.toLowerCase().replace(/\\/g, '/'), lib);
        }
    }
    return idx;
}

function normalizeIncludeKey(inc: string): string | null {
    let n = inc.trim().toLowerCase().replace(/\\/g, '/');
    while (n.startsWith('./')) n = n.slice(2);
    if (n.startsWith('lib/')) n = n.slice(4);
    return n || null;
}

async function readLibFromDisk(sourceRoot: string, lib: ManifestLibEntry): Promise<string[] | null> {
    if (lib.files.length === 0) return null;
    const out: string[] = [];
    for (const file of lib.files) {
        const abs = path.join(sourceRoot, LIB_DIR, file.path);
        try {
            out.push(await fs.readFile(abs, 'utf-8'));
        } catch {
            return null;
        }
    }
    return out;
}

async function fetchLibForParse(
    source: VaultSource,
    owner: string,
    repo: string,
    branch: string,
    lib: ManifestLibEntry,
    deps: DepsCheckDeps,
): Promise<string[]> {
    if (source.type !== 'git') return [];
    const out: string[] = [];
    for (const file of lib.files) {
        try {
            const buf = await fetchFileContent(
                source,
                owner,
                repo,
                branch,
                `${LIB_DIR}/${file.path}`,
                deps.tokens,
            );
            if (buf) out.push(buf.toString('utf-8'));
        } catch (err) {
            deps.logger.warn('checkScriptDeps: fetch lib failed', { libName: lib.name, err });
        }
    }
    return out;
}
