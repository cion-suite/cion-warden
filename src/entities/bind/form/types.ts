import type { ConfigField } from '@shared/types';

export interface PresetFormProps {
    sourceId: string;
    presetId: string;
}

export interface NumberInputProps {
    value: number;
    onChange: (n: number) => void;
}

export interface PresetFieldRowProps {
    field: ConfigField;
    value: string | number | undefined;
    onChange: (v: string | number) => void;
}
