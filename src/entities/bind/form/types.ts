import type { PresetField } from '@shared/types';

export interface PresetFormProps {
    sourceId: string;
    presetId: string;
}

export interface NumberInputProps {
    value: number;
    onChange: (n: number) => void;
}

export interface PresetFieldRowProps {
    field: PresetField;
    value: string | number | boolean | undefined;
    onChange: (v: string | number | boolean) => void;
}
