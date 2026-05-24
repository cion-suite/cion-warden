export interface MissingLib {
    kind: 'lib';
    sourceId: string;
    libId: string;
    name: string;
}

export interface MissingPreset {
    kind: 'preset';
    sourceId: string;
    presetId: string;
    name: string;
}

export type MissingItem = MissingLib | MissingPreset;

export interface DepsCheckResult {
    missing: MissingItem[];
    unknown: string[];
}
