import { useState } from 'react';
import type { ConfigSchema, ConfigValues } from '@shared/types';

import { configValues } from './config-values';
import type { ConfigFormSave } from './types';

/** Правки поверх файла; после удачного save гасятся. */
export function useConfigForm(schema: ConfigSchema | null, save: ConfigFormSave) {
    const [edits, setEdits] = useState<ConfigValues>({});
    const [saving, setSaving] = useState(false);

    const saved = configValues.saved(schema);
    const values: ConfigValues = { ...saved, ...edits };
    const dirty = !configValues.equal(values, saved);

    const setValue = (key: string, value: string | number) => {
        setEdits((prev) => ({ ...prev, [key]: value }));
    };

    const submit = async (): Promise<void> => {
        setSaving(true);
        try {
            if (await save(edits)) setEdits({});
        } finally {
            setSaving(false);
        }
    };

    return { values, dirty, saving, setValue, save: submit };
}
