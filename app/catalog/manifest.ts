import path from 'node:path';
import { errors, logger } from '@cion-suite/core';
import { fsx } from '@app/utils/fsx';
import { paths } from '@app/utils/paths';
import type { ManifestFile, ManifestLibEntry, ManifestPresetEntry } from '@app/catalog/types';

const log = logger.child('Catalog');

// Смена формы manifest: старый etag дал бы 304 и оставил
// неполные записи навсегда, поэтому версия сбрасывает кеш
export const MANIFEST_VERSION = 5;

const normalizeLib = (raw: Partial<ManifestLibEntry>): ManifestLibEntry => ({
    name: raw.name ?? '',
    kind: raw.kind ?? 'file',
    path: raw.path ?? '',
    sha: raw.sha ?? '',
    webUrl: raw.webUrl,
    files: Array.isArray(raw.files) ? raw.files : [],
});

// У старых manifest части полей нет
function normalize(raw: Partial<ManifestFile>): ManifestFile {
    return {
        version: raw.version ?? 1,
        etag: raw.etag ?? null,
        treeSha: raw.treeSha ?? null,
        branch: raw.branch ?? 'main',
        lastSyncedAt: raw.lastSyncedAt ?? 0,
        lastCheckedAt: raw.lastCheckedAt ?? raw.lastSyncedAt ?? 0,
        scripts: raw.scripts ?? [],
        cfgs: raw.cfgs ?? [],
        support: raw.support ?? [],
        libs: Array.isArray(raw.libs) ? raw.libs.map(normalizeLib) : [],
        presets: raw.presets ?? [],
        fonts: Array.isArray(raw.fonts) ? raw.fonts : [],
    };
}

// Битый manifest - как "не синхронизирован": sync перезапишет
async function read(sourceId: string): Promise<ManifestFile | null> {
    const raw = await fsx.json.read<Partial<ManifestFile> | null>(paths.source(sourceId).manifest)
        .catch((e: unknown) => {
            log.warn('Manifest unreadable', e, { sourceId });
            return undefined;
        });
    return raw !== null && typeof raw === 'object' ? normalize(raw) : null;
}

async function get(sourceId: string): Promise<ManifestFile> {
    const manifest = await read(sourceId);
    if (!manifest) throw errors.fail('not_found', 'Source is not synced');
    return manifest;
}

/** Каталоги репозитория, они же в global_vault/<id>. */
const dir = {
    scripts: 'scripts',
    cfg: 'cfg',
    lib: 'lib',
    presets: 'presets',
    fonts: 'assets/fonts',
} as const;

/** Имя без последнего расширения. */
const stem = (fileName: string): string => path.parse(fileName).name;

/** manifest источника, id сущностей и поиск в нём. */
export const manifest = {
    read,
    get,
    write: (sourceId: string, data: ManifestFile): Promise<void> => fsx.json.write(paths.source(sourceId).manifest, data),
    dir,
    stem,
    lib: {
        id: (sourceId: string, name: string): string => `${sourceId}:lib:${name}`,
        find: (data: ManifestFile, sourceId: string, libId: string): ManifestLibEntry | null =>
            data.libs.find(lib => manifest.lib.id(sourceId, lib.name) === libId) ?? null,
    },
    cfg: {
        // v1: конфиг скрипта - cfg_<файл скрипта> с расширением
        name: (fileName: string): string => `cfg_${fileName}`,
    },
    preset: {
        id: (sourceId: string, fileName: string): string => `${sourceId}:preset:${fileName}`,
        find: (data: ManifestFile, sourceId: string, presetId: string): ManifestPresetEntry | null =>
            data.presets.find(preset => manifest.preset.id(sourceId, preset.fileName) === presetId) ?? null,
    },
    font: {
        id: (sourceId: string, fileName: string): string => `${sourceId}:font:${fileName}`,
    },
};
