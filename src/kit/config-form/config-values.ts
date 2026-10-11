import type { ConfigField, ConfigSchema, ConfigValues } from '@shared/types';

export const configValues = {
    fields(schema: ConfigSchema | null): ConfigField[] {
        return schema?.sections.flatMap((s) => s.fields) ?? [];
    },

    /** Значения, как они сейчас в файле. */
    saved(schema: ConfigSchema | null): ConfigValues {
        return Object.fromEntries(configValues.fields(schema).map((f) => [f.key, f.value]));
    },

    equal(a: ConfigValues, b: ConfigValues): boolean {
        const keys = Object.keys(a);
        if (keys.length !== Object.keys(b).length) return false;
        return keys.every((k) => a[k] === b[k]);
    },
};
