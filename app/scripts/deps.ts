import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '@cion-suite/core';
import { catalog } from '@app/catalog';
import type { ManifestFile, ManifestLibEntry, ManifestPresetEntry } from '@app/catalog/types';
import { github } from '@app/github';
import { scripts } from '@app/scripts';
import { store, type SourceRecord } from '@app/sources/store';
import { ahk } from '@app/utils/ahk';
import { fsx } from '@app/utils/fsx';
import { paths } from '@app/utils/paths';
import type { MissingLib, MissingPreset, ScriptDeps } from '@shared/types';

const log = logger.child('Scripts');

// Короче - слишком частое совпадение с обычным текстом
const MIN_BASENAME_LEN = 4;

interface LibScan {
    missing: MissingLib[];
    unknown: string[];
    // Libs, уже разобранные по #Include: их скан имён не повторяет
    touched: Set<string>;
}

const empty = (): ScriptDeps => ({ missing: [], unknown: [] });

function libIndex(libs: ManifestLibEntry[]): Map<string, ManifestLibEntry> {
    const index = new Map<string, ManifestLibEntry>();
    for (const lib of libs) {
        for (const file of lib.files) index.set(file.path.toLowerCase().replace(/\\/g, '/'), lib);
    }
    return index;
}

// Ключ lib-индекса: без `./` и префикса `lib/`
function includeKey(include: string): string {
    let key = include.trim().toLowerCase().replace(/\\/g, '/');
    while (key.startsWith('./')) key = key.slice(2);
    return key.startsWith('lib/') ? key.slice(4) : key;
}

// Относительно scripts/: без `./` и подъёма `../` наружу
function scriptsKey(include: string): string {
    const key = path.posix.normalize(include.trim().toLowerCase().replace(/\\/g, '/'));
    return key.replace(/^(?:\.\.\/)+/, '');
}

// Не lib, но поставляется источником: support и cfg
function shippedIndex(manifest: ManifestFile): Set<string> {
    const keys = manifest.support.map(file => scriptsKey(file.fileName));
    keys.push(...manifest.cfgs.map(file => scriptsKey(`${catalog.dir.cfg}/${file.fileName}`)));
    return new Set(keys);
}

const isShipped = (include: string, shipped: Set<string>): boolean => {
    const key = scriptsKey(include);
    return key.startsWith(`${catalog.dir.presets}/`) || shipped.has(key);
};

// Все файлы lib на диске или null: неполная lib - отсутствует
async function readLocal(libRoot: string, lib: ManifestLibEntry): Promise<string[] | null> {
    if (lib.files.length === 0) return null;
    try {
        return await Promise.all(lib.files.map(file => fs.readFile(path.join(libRoot, file.path), 'utf-8')));
    } catch {
        return null;
    }
}

// Отсутствующая lib читается из репо: её #Include тоже нужны
async function readRemote(source: SourceRecord, lib: ManifestLibEntry): Promise<string[]> {
    const out: string[] = [];
    for (const file of lib.files) {
        const content = await github.file(source, `${catalog.dir.lib}/${file.path}`, { fallback: null });
        if (content) out.push(content.toString('utf-8'));
    }
    return out;
}

async function scanIncludes(content: string, source: SourceRecord, manifest: ManifestFile): Promise<LibScan> {
    const libRoot = paths.source(source.id).lib;
    const index = libIndex(manifest.libs);
    const shipped = shippedIndex(manifest);
    const visited = new Set<string>();
    const missing = new Map<string, ManifestLibEntry>();
    const unknown = new Set<string>();
    const queue = [content];

    for (let text = queue.shift(); text !== undefined; text = queue.shift()) {
        for (const include of ahk.includes(text)) {
            const key = includeKey(include);
            const lib = key === '' ? undefined : index.get(key);
            if (!lib) {
                if (key !== '' && !isShipped(include, shipped)) unknown.add(include);
                continue;
            }
            if (visited.has(lib.name)) continue;
            visited.add(lib.name);

            const local = await readLocal(libRoot, lib);
            if (local) {
                queue.push(...local);
                continue;
            }
            missing.set(lib.name, lib);
            queue.push(...await readRemote(source, lib));
        }
    }

    return {
        missing: [...missing.values()].map(lib => ({
            kind: 'lib',
            sourceId: source.id,
            libId: catalog.lib.id(source.id, lib.name),
            name: lib.name,
        })),
        unknown: [...unknown],
        touched: visited,
    };
}

// #Include видит не всё: lib читают и в рантайме. Ловим
// по имени файла в тексте скрипта.
async function scanNames(
    content: string,
    source: SourceRecord,
    libs: ManifestLibEntry[],
    touched: Set<string>,
): Promise<MissingLib[]> {
    const libRoot = paths.source(source.id).lib;
    const haystack = content.toLowerCase();
    const out: MissingLib[] = [];
    for (const lib of libs) {
        if (touched.has(lib.name)) continue;
        const referenced = lib.files.some((file) => {
            const base = path.basename(file.path).toLowerCase();
            return base.length >= MIN_BASENAME_LEN && haystack.includes(base);
        });
        if (!referenced || await readLocal(libRoot, lib)) continue;
        out.push({ kind: 'lib', sourceId: source.id, libId: catalog.lib.id(source.id, lib.name), name: lib.name });
    }
    return out;
}

// Пресеты ни в #Include, ни иначе явно не подключают:
// ищем имя файла из manifest в тексте без учёта регистра
async function scanPresets(
    content: string,
    source: SourceRecord,
    presets: ManifestPresetEntry[],
): Promise<MissingPreset[]> {
    const root = paths.source(source.id).presets;
    const haystack = content.toLowerCase();
    const out: MissingPreset[] = [];
    for (const preset of presets) {
        if (!haystack.includes(preset.fileName.toLowerCase())) continue;
        if (await fsx.exists(path.join(root, preset.fileName))) continue;
        out.push({
            kind: 'preset',
            sourceId: source.id,
            presetId: catalog.preset.id(source.id, preset.fileName),
            name: catalog.stem(preset.fileName),
        });
    }
    return out;
}

async function check(scriptPath: string, source: SourceRecord): Promise<ScriptDeps> {
    const manifest = await catalog.manifest.read(source.id);
    if (!manifest) return empty();

    let content: string;
    try {
        content = await fs.readFile(scriptPath, 'utf-8');
    } catch (e) {
        log.warn(`Cannot read script: ${scriptPath}`, e);
        return empty();
    }

    const libs = await scanIncludes(content, source, manifest);
    const named = await scanNames(content, source, manifest.libs, libs.touched);
    const presets = await scanPresets(content, source, manifest.presets);
    return { missing: [...libs.missing, ...named, ...presets], unknown: libs.unknown };
}

/** Чего не хватает скрипту: libs и пресеты. */
export const deps = {
    async get(id: string): Promise<ScriptDeps> {
        const filePath = scripts.path(id);
        const [sourceId = ''] = path.relative(paths.vault(), filePath).split(path.sep);
        if (sourceId === '' || sourceId.startsWith('..')) return empty();
        // Источник мог быть удалён при живых файлах в vault
        const source = (await store.list()).find(s => s.id === sourceId);
        return source ? check(filePath, source) : empty();
    },
};
