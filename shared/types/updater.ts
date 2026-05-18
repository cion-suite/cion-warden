export interface UpdaterInfo {
    version: string;
    releaseNotes?: string;
    releaseName?: string;
    releaseDate?: string;
}

export interface UpdaterProgress {
    bytesPerSecond: number;
    percent: number;
    transferred: number;
    total: number;
}
