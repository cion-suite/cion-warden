import type { ConfigField, ConfigSchema, ConfigValues } from '@shared/types';

export interface ConfigFormProps {
    schema: ConfigSchema;
    values: ConfigValues;
    onChange: (key: string, value: string | number) => void;
}

export interface ConfigFieldRowProps {
    field: ConfigField;
    value: string | number | undefined;
    onChange: (value: string | number) => void;
}

export interface NumberInputProps {
    value: number;
    onChange: (n: number) => void;
}

/** true - сохранено, данные формы свежие. */
export type ConfigFormSave = (edits: ConfigValues) => Promise<boolean>;
