import type { PresetField, PresetSchema, PresetValues } from '@shared/types';

export const presetValues = {
    fields(schema: PresetSchema | null): PresetField[] {
        return schema?.sections.flatMap((s) => s.fields) ?? [];
    },

    defaults(schema: PresetSchema | null): PresetValues {
        const out: PresetValues = {};
        for (const f of presetValues.fields(schema)) out[f.key] = f.default;
        return out;
    },

    /**
     * На диск - только отличия от defaults: новые defaults схемы
     * доходят до нетронутых полей.
     */
    strip(values: PresetValues, schema: PresetSchema | null): PresetValues {
        const fields = presetValues.fields(schema);
        if (fields.length === 0) return { ...values };
        const out: PresetValues = {};
        for (const f of fields) {
            const v = values[f.key];
            if (v !== undefined && v !== f.default) out[f.key] = v;
        }
        return out;
    },

    equal(a: PresetValues, b: PresetValues): boolean {
        const keys = Object.keys(a);
        if (keys.length !== Object.keys(b).length) return false;
        return keys.every((k) => a[k] === b[k]);
    },
};
