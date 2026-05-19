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

export interface ScriptMeta {
    id: string;
    name: string;
    filePath: string;
    configPath?: string;
    config?: ScriptCfgFile;
    status: 'idle' | 'running' | 'error';
    errorMessage?: string;
    modifiedAt?: number;
}
