export interface Bind {
    id: string;
    name: string;
    fileName: string;
    sourceId: string;
    sourceName: string;
    sha?: string;
    isDownloaded: boolean;
    hasUpdate: boolean;
    downloadUrl?: string;
}

/** Итог массовой загрузки binds:sync. */
export interface BindSync {
    ok: number;
    failed: number;
}
