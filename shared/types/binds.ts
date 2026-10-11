export type PresetFieldType = 'hotkey' | 'number' | 'string' | 'boolean';

export interface PresetField {
    /** "<section>.<field>": он же ключ в PresetValues. */
    key: string;
    label: string;
    type: PresetFieldType;
    default: string | number | boolean;
    tooltip?: string;
}

export interface PresetSection {
    /** Ключ секции в json на диске. */
    name: string;
    /** Заголовок: из name, если схема не задала свой. */
    title: string;
    fields: PresetField[];
}

export interface PresetSchema {
    title: string;
    sections: PresetSection[];
}

/** Плоский "<section>.<field>"; на диск пишется вложенным. */
export type PresetValues = Record<string, string | number | boolean>;

export interface Bind {
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

/** Итог массовой загрузки binds:sync. */
export interface BindSync {
    ok: number;
    failed: number;
}
