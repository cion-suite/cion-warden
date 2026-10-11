import path from 'node:path';
import { errors } from '@cion-suite/core';
import { github } from '@app/github';
import type { GithubTreeEntry } from '@app/github/types';
import type { SourceRecord } from '@app/sources/store';
import { manifest } from '@app/catalog/manifest';
import type {
    FontsSidecar,
    FontsSidecarEntry,
    ManifestFileEntry,
    ManifestFontEntry,
    ManifestLibEntry,
    RepoLinks,
} from '@app/catalog/types';
import { repo } from '@shared/repo';
import { schema } from '@shared/schema';
import type { LibFile } from '@shared/types';

const { dir } = manifest;

const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.ttc', '.fon']);
const SIDECAR_NAME = '_fonts.json';
const SIDECAR_PATH = `${dir.fonts}/${SIDECAR_NAME}`;

// Не пройдут в имя значения реестра и heredoc PowerShell
const UNSAFE_FACE = /[\\/:*?"<>|\r\n\t\0]/;

type Tree = GithubTreeEntry[];

const isName = (name: string): boolean => schema.file.name.safeParse(name).success;

function sorted<T>(list: T[], key: (item: T) => string): T[] {
    return list.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

function links(source: SourceRecord): RepoLinks {
    const ref = repo.parse(source.url);
    errors.assert(ref, 'Only GitHub repositories are supported');
    const base = `${ref.owner}/${ref.repo}`;
    const branch = github.encode(source.branch || 'main');
    return {
        raw: repoPath => `https://raw.githubusercontent.com/${base}/${branch}/${github.encode(repoPath)}`,
        blob: repoPath => `https://github.com/${base}/blob/${branch}/${github.encode(repoPath)}`,
        tree: repoPath => `https://github.com/${base}/tree/${branch}/${github.encode(repoPath)}`,
    };
}

// Один файл прямо в каталоге prefix, без вложенных путей
function fileIn(entry: GithubTreeEntry, prefix: string): string | null {
    if (entry.type !== 'blob' || !entry.path.startsWith(prefix)) return null;
    const rel = entry.path.slice(prefix.length);
    return rel !== '' && !rel.includes('/') && isName(rel) ? rel : null;
}

function scripts(tree: Tree, to: RepoLinks): { scripts: ManifestFileEntry[]; cfgs: ManifestFileEntry[] } {
    const cfgPrefix = `${dir.scripts}/${dir.cfg}/`;
    const scriptList: ManifestFileEntry[] = [];
    const cfgList: ManifestFileEntry[] = [];
    for (const entry of tree) {
        const cfg = fileIn(entry, cfgPrefix);
        if (cfg !== null) {
            cfgList.push({ fileName: cfg, sha: entry.sha, downloadUrl: to.raw(entry.path) });
            continue;
        }
        // Всё под cfg/ - не скрипт, даже с отвергнутым именем
        if (entry.path.startsWith(cfgPrefix)) continue;
        const name = fileIn(entry, `${dir.scripts}/`);
        if (name !== null) scriptList.push({ fileName: name, sha: entry.sha, downloadUrl: to.raw(entry.path) });
    }
    return {
        scripts: sorted(scriptList, item => item.fileName),
        cfgs: sorted(cfgList, item => item.fileName),
    };
}

function presets(tree: Tree, to: RepoLinks): ManifestFileEntry[] {
    const list: ManifestFileEntry[] = [];
    for (const entry of tree) {
        const name = fileIn(entry, `${dir.presets}/`);
        if (name === null) continue;
        const lower = name.toLowerCase();
        // <name>.values.json - локальные значения, не схема: иначе
        // карточка-призрак и столкновение при удалении
        if (!lower.endsWith('.json') || lower.endsWith('.values.json')) continue;
        list.push({ fileName: name, sha: entry.sha, downloadUrl: to.raw(entry.path) });
    }
    return sorted(list, item => item.fileName);
}

function libs(tree: Tree, to: RepoLinks): ManifestLibEntry[] {
    const root = `${dir.lib}/`;
    const fileEntries = new Map<string, { path: string; sha: string }>();
    const folderEntries = new Map<string, { sha: string }>();
    const filesPerFolder = new Map<string, LibFile[]>();

    for (const entry of tree) {
        if (!entry.path.startsWith(root)) continue;
        const rel = entry.path.slice(root.length);
        if (!rel) continue;
        const slash = rel.indexOf('/');
        const top = slash === -1 ? rel : rel.slice(0, slash);

        if (slash === -1) {
            if (entry.type === 'blob') fileEntries.set(rel, { path: rel, sha: entry.sha });
            else if (entry.type === 'tree') folderEntries.set(top, { sha: entry.sha });
        } else if (entry.type === 'blob') {
            const files = filesPerFolder.get(top) ?? [];
            files.push({ path: rel, sha: entry.sha, downloadUrl: to.raw(`${root}${rel}`) });
            filesPerFolder.set(top, files);
            if (!folderEntries.has(top)) folderEntries.set(top, { sha: entry.sha });
        }
    }

    // Файл и папка с одним именем без расширения: файлу оставляем
    // полное имя, иначе id совпадут
    const list: ManifestLibEntry[] = [];
    for (const [fileName, file] of fileEntries) {
        const stripped = manifest.stem(fileName);
        list.push({
            name: folderEntries.has(stripped) ? fileName : stripped,
            kind: 'file',
            path: file.path,
            sha: file.sha,
            webUrl: to.blob(`${root}${file.path}`),
            files: [{ path: file.path, sha: file.sha, downloadUrl: to.raw(`${root}${file.path}`) }],
        });
    }
    for (const [folder, info] of folderEntries) {
        list.push({
            name: folder,
            kind: 'folder',
            path: folder,
            sha: info.sha,
            webUrl: to.tree(`${root}${folder}`),
            files: filesPerFolder.get(folder) ?? [],
        });
    }
    return sorted(list, item => item.name);
}

function fonts(tree: Tree, sidecar: FontsSidecar | null, to: RepoLinks): ManifestFontEntry[] {
    const byFile = new Map<string, FontsSidecarEntry>();
    for (const entry of sidecar?.fonts ?? []) byFile.set(entry.file.toLowerCase(), entry);

    const list: ManifestFontEntry[] = [];
    for (const entry of tree) {
        const name = fileIn(entry, `${dir.fonts}/`);
        if (name === null || name === SIDECAR_NAME) continue;
        const ext = path.extname(name).toLowerCase();
        if (!FONT_EXTENSIONS.has(ext)) continue;
        const extra = byFile.get(name.toLowerCase());
        list.push({
            fileName: name,
            face: extra?.face ?? manifest.stem(name).replace(/[-_]+/g, ' ').trim(),
            sha: entry.sha,
            downloadUrl: to.raw(entry.path),
            // .fon (растровый) в пользовательский каталог не ставится:
            // запись остаётся, установка её пропускает
            skip: extra?.skip === true || ext === '.fon' ? true : undefined,
        });
    }
    return sorted(list, item => item.fileName);
}

// Sidecar лежит в репозитории и доходит до argv reg.exe:
// недоверенный ввод, негодные записи отбрасываем
function sanitize(raw: unknown): FontsSidecarEntry | null {
    if (raw === null || typeof raw !== 'object') return null;
    const { file, face, skip } = raw as Record<string, unknown>;
    if (typeof file !== 'string' || !isName(file)) return null;
    const flag = skip === true ? true : undefined;
    if (face === undefined || face === null) return { file, skip: flag };
    if (typeof face !== 'string' || UNSAFE_FACE.test(face)) return null;
    return { file, face: face.trim() || undefined, skip: flag };
}

function parseSidecar(content: Buffer | null): FontsSidecar | null {
    if (!content) return null;
    try {
        const parsed = JSON.parse(content.toString('utf-8')) as Partial<FontsSidecar> | null;
        if (!parsed || !Array.isArray(parsed.fonts)) return null;
        return { fonts: parsed.fonts.flatMap(raw => sanitize(raw) ?? []) };
    } catch {
        return null;
    }
}

/** Разбор дерева репозитория на записи manifest. */
export const derive = {
    links,
    scripts,
    presets,
    libs,
    fonts,
    sidecar: { path: SIDECAR_PATH, parse: parseSidecar },
};
