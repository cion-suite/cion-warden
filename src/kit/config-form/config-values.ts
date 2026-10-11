import type { ConfigField, ConfigSchema, ConfigSection, ConfigValues } from '@shared/types';

export const configValues = {
    /** Секции без пустых: поля не-hotkey и поля hotkey (бинды). */
    split(schema: ConfigSchema): { values: ConfigSection[]; binds: ConfigSection[] } {
        const pick = (bind: boolean) =>
            schema.sections
                .map((s) => ({ ...s, fields: s.fields.filter((f) => (f.type === 'hotkey') === bind) }))
                .filter((s) => s.fields.length > 0);
        return { values: pick(false), binds: pick(true) };
    },

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
