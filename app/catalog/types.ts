import type { Bind, CatalogScript, Lib, LibFile, LibKind } from '@shared/types';

export interface ManifestFileEntry {
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
    files: LibFile[];
}

export interface ManifestFontEntry extends ManifestFileEntry {
    face: string;
    skip?: boolean;
}

/** .manifest.json: дерево репозитория по видам. */
export interface ManifestFile {
    version: number;
    etag: string | null;
    treeSha: string | null;
    branch: string;
    lastSyncedAt: number;
    lastCheckedAt: number;
    scripts: ManifestFileEntry[];
    cfgs: ManifestFileEntry[];
    libs: ManifestLibEntry[];
    presets: ManifestFileEntry[];
    fonts: ManifestFontEntry[];
}

export type ManifestPresetEntry = ManifestFileEntry;

/** Запись assets/fonts/_fonts.json. */
export interface FontsSidecarEntry {
    file: string;
    face?: string;
    skip?: boolean;
}

export interface FontsSidecar {
    fonts: FontsSidecarEntry[];
}

/** Кеш sha: mtime и size - признак годности записи. */
export interface LocalCacheEntry {
    mtime: number;
    size: number;
    sha: string;
}

export type LocalCache = Record<string, LocalCacheEntry>;

/** Ссылки на файлы репозитория источника. */
export interface RepoLinks {
    raw: (repoPath: string) => string;
    blob: (repoPath: string) => string;
    tree: (repoPath: string) => string;
}

export interface CatalogMetas {
    scripts: CatalogScript[];
    libs: Lib[];
    presets: Bind[];
}
