export interface RemoteScriptMeta {
    id: string;
    name: string;
    fileName: string;
    sourceId: string;
    sourceName: string;
    sha?: string;
    localSha?: string;
    isDownloaded: boolean;
    hasUpdate: boolean;
    downloadUrl?: string;
}
