export type LibKind = 'file' | 'folder';

export interface RemoteLibFileEntry {
    path: string;
    sha: string;
    downloadUrl: string | null;
}

export interface RemoteLibraryMeta {
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
    files: RemoteLibFileEntry[];
}
