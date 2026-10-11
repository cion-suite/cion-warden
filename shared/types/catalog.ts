export interface CatalogScript {
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

/** Итог синхронизации источника; он же нагрузка source:synced. */
export interface SourceSync {
    sourceId: string;
    lastSyncedAt: number;
    /** TTL-попадание или 304: дерево не перекачивалось. */
    fromCache: boolean;
}
