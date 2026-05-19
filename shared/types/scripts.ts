export interface HkEntry {
    key: string;
    description: string;
    tooltip?: string;
}

export interface ValEntry {
    val: string | number | boolean;
    description: string;
    tooltip?: string;
}

export interface ScriptCfgFile {
    $version?: number;
    hk?: Record<string, HkEntry>;
    val?: Record<string, ValEntry>;
}

export type ScriptStatus = 'idle' | 'running' | 'error';

export interface ScriptCfgValues {
    hk: Record<string, string>;
    val: Record<string, string | number | boolean>;
}

export interface ScriptMeta {
    id: string;
    name: string;
    filePath: string;
    configPath?: string;
    config?: ScriptCfgFile;
    status: ScriptStatus;
    errorMessage?: string;
    modifiedAt?: number;
}
