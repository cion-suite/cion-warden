export type ConfigFieldType = 'hotkey' | 'number' | 'string';

export interface ConfigField {
    /** Имя переменной AHK как в файле; ищется без учёта регистра. */
    key: string;
    label: string;
    type: ConfigFieldType;
    /** Текущее значение в файле. */
    value: string | number;
    tooltip?: string;
}

export interface ConfigSection {
    /** Пусто у полей до первого заголовка. */
    title: string;
    fields: ConfigField[];
}

export interface ConfigSchema {
    sections: ConfigSection[];
}

export type ConfigValues = Record<string, string | number>;
