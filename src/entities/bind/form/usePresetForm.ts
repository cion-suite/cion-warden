import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PresetSchema, PresetValues } from '@shared/types';

import { useT } from '@/lib/i18n';
import { toast } from '@/ui/toast';
import { presetValues } from './preset-values';

export function usePresetForm(sourceId: string, presetId: string) {
    const t = useT();
    const queryClient = useQueryClient();
    const [edits, setEdits] = useState<PresetValues>({});
    const [saving, setSaving] = useState(false);

    const schemaQuery = useQuery({
        queryKey: ['binds:schema:get', sourceId, presetId],
        queryFn: () => window.binds.schema.get(sourceId, presetId),
    });
    const valuesKey = ['binds:values:get', sourceId, presetId];
    const valuesQuery = useQuery({
        queryKey: valuesKey,
        queryFn: () => window.binds.values.get(sourceId, presetId),
    });

    const schema: PresetSchema | null = schemaQuery.data ?? null;
    const saved: PresetValues = { ...presetValues.defaults(schema), ...valuesQuery.data };
    const values: PresetValues = { ...saved, ...edits };
    const dirty = !presetValues.equal(values, saved);

    const setValue = (key: string, v: string | number | boolean) => {
        setEdits((prev) => ({ ...prev, [key]: v }));
    };

    const save = async (): Promise<boolean> => {
        const payload = presetValues.strip(values, schema);
        setSaving(true);
        try {
            const ok = await toast.result(window.binds.values.save(sourceId, presetId, payload), {
                success: t('binds.saved'),
                error: t('error'),
            });
            if (ok) {
                queryClient.setQueryData(valuesKey, payload);
                setEdits({});
            }
            return ok;
        } finally {
            setSaving(false);
        }
    };

    const reset = async (): Promise<boolean> => {
        const ok = await toast.result(window.binds.values.reset(sourceId, presetId), { error: t('error') });
        if (ok) {
            queryClient.setQueryData(valuesKey, {});
            setEdits({});
        }
        return ok;
    };

    return {
        schema,
        values,
        loading: schemaQuery.isPending || valuesQuery.isPending,
        dirty,
        saving,
        setValue,
        save,
        reset,
    };
}
