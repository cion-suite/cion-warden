import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PresetSchema, PresetValues } from '@shared/types/binds';

function allFields(schema: PresetSchema | null) {
    if (!schema || !Array.isArray(schema.sections)) return [];
    return schema.sections.flatMap((s) => s.fields ?? []);
}

function defaultsFor(schema: PresetSchema | null): PresetValues {
    const out: PresetValues = {};
    for (const f of allFields(schema)) out[f.key] = f.default;
    return out;
}

// Persist only diffs from schema defaults: keeps the values file lean and lets
// future schema-default changes propagate to fields the user never touched.
function stripDefaults(values: PresetValues, schema: PresetSchema | null): PresetValues {
    const fields = allFields(schema);
    if (fields.length === 0) return { ...values };
    const out: PresetValues = {};
    for (const f of fields) {
        const v = values[f.key];
        if (v !== undefined && v !== f.default) out[f.key] = v;
    }
    return out;
}

function valuesEqual(a: PresetValues, b: PresetValues): boolean {
    const ak = Object.keys(a);
    if (ak.length !== Object.keys(b).length) return false;
    for (const k of ak) if (a[k] !== b[k]) return false;
    return true;
}

export interface PresetFormState {
    schema: PresetSchema | null;
    values: PresetValues;
    loading: boolean;
    dirty: boolean;
    saving: boolean;
    setValue: (key: string, v: string | number | boolean) => void;
    save: () => Promise<void>;
    reset: () => Promise<void>;
}

export function usePresetForm(sourceId: string | null, presetId: string | null): PresetFormState {
    const [schema, setSchema] = useState<PresetSchema | null>(null);
    const [values, setValues] = useState<PresetValues>({});
    // Snapshot of the merged-on-load (or post-save) state. Used to derive
    // `dirty` and to support an explicit Save flow — no auto-save.
    const [savedSnap, setSavedSnap] = useState<PresetValues>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!sourceId || !presetId) {
            setSchema(null);
            setValues({});
            setSavedSnap({});
            setLoading(false);
            return;
        }
        setLoading(true);
        let cancelled = false;
        void (async () => {
            const [s, v] = await Promise.all([
                window.app!.binds.getSchema(sourceId, presetId),
                window.app!.binds.getValues(sourceId, presetId),
            ]);
            if (cancelled) return;
            const merged = { ...defaultsFor(s), ...v };
            setSchema(s);
            setValues(merged);
            setSavedSnap(merged);
            setLoading(false);
        })();
        return () => {
            cancelled = true;
        };
    }, [sourceId, presetId]);

    const dirty = useMemo(() => !valuesEqual(values, savedSnap), [values, savedSnap]);

    const setValue = useCallback((key: string, v: string | number | boolean) => {
        setValues((prev) => ({ ...prev, [key]: v }));
    }, []);

    const save = useCallback(async () => {
        if (!sourceId || !presetId) return;
        setSaving(true);
        try {
            const payload = stripDefaults(values, schema);
            await window.app!.binds.saveValues(sourceId, presetId, payload);
            setSavedSnap({ ...defaultsFor(schema), ...payload });
        } finally {
            setSaving(false);
        }
    }, [sourceId, presetId, schema, values]);

    const reset = useCallback(async () => {
        if (!sourceId || !presetId) return;
        await window.app!.binds.reset(sourceId, presetId);
        const defaults = defaultsFor(schema);
        setValues(defaults);
        setSavedSnap(defaults);
    }, [sourceId, presetId, schema]);

    return { schema, values, loading, dirty, saving, setValue, save, reset };
}
