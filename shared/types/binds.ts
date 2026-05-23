export type PresetFieldType = 'hotkey' | 'number' | 'string' | 'boolean';

export interface PresetField {
    // Dotted path: "<section>.<field>". Used as the flat key in PresetValues.
    key: string;
    label: string;
    type: PresetFieldType;
    default: string | number | boolean;
    tooltip?: string;
}

export interface PresetSection {
    // Raw key of the section in the on-disk JSON.
    name: string;
    // Human-readable section title (derived from `name` unless schema overrides).
    title: string;
    fields: PresetField[];
}

export interface PresetSchema {
    title: string;
    sections: PresetSection[];
}

// Flat map keyed by "<section>.<field>". Reified to nested when persisted.
export type PresetValues = Record<string, string | number | boolean>;

export interface RemotePresetMeta {
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
