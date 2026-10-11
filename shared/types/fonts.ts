export interface Font {
    assetId: string;
    sourceId: string;
    fileName: string;
    face: string;
    sha: string;
    systemPath: string;
    registryName: string;
    installedAt: number;
}

export interface FontInstall {
    ok: number;
    failed: number;
    skipped: number;
}
