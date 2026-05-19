export interface ConfigField {
    key: string;
    label: string;
    type: 'hotkey' | 'number' | 'text' | 'toggle';
    default?: unknown;
    description?: string;
}

export interface ScriptConfig {
    name?: string;
    author?: string;
    version?: string;
    fields?: ConfigField[];
}

export interface ScriptMeta {
    id: string;
    name: string;
    filePath: string;
    configPath?: string;
    config?: ScriptConfig;
    status: 'idle' | 'running' | 'error';
    errorMessage?: string;
    modifiedAt?: number;
}
