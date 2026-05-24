export interface FontsSidecarEntry {
    file: string;
    face?: string;
    skip?: boolean;
}

export interface FontsSidecar {
    fonts: FontsSidecarEntry[];
}

export interface InstalledFont {
    assetId: string;
    sourceId: string;
    fileName: string;
    face: string;
    sha: string;
    systemPath: string;
    registryName: string;
    installedAt: number;
}

export interface FontInstallSummary {
    ok: number;
    failed: number;
    skipped: number;
}
