export type LibKind = 'file' | 'folder';

export interface LibFile {
    path: string;
    sha: string;
    downloadUrl: string | null;
}

export interface Lib {
    id: string;
    name: string;
    kind: LibKind;
    path: string;
    sourceId: string;
    sourceName: string;
    sha?: string;
    isDownloaded: boolean;
    hasUpdate: boolean;
    webUrl?: string;
    files: LibFile[];
}

/** Итог массовой загрузки libs:sync. */
export interface LibSync {
    ok: number;
    failed: number;
}
