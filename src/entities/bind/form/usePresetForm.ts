import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ConfigValues } from '@shared/types';

import { useT } from '@/lib/i18n';
import { toast } from '@/ui/toast';
import { presetValues } from './preset-values';

export function usePresetForm(sourceId: string, presetId: string) {
    const t = useT();
    const [edits, setEdits] = useState<ConfigValues>({});
    const [saving, setSaving] = useState(false);

    const schemaQuery = useQuery({
        queryKey: ['binds:schema:get', sourceId, presetId],
        queryFn: () => window.binds.schema.get(sourceId, presetId),
    });

    const schema = schemaQuery.data ?? null;
    const saved = presetValues.saved(schema);
    const values: ConfigValues = { ...saved, ...edits };
    const dirty = !presetValues.equal(values, saved);

    const setValue = (key: string, v: string | number) => {
        setEdits((prev) => ({ ...prev, [key]: v }));
    };

    const save = async (): Promise<boolean> => {
        setSaving(true);
        try {
            const ok = await toast.result(window.binds.values.save(sourceId, presetId, edits), {
                success: t('binds.saved'),
                error: t('error'),
            });
            if (ok) {
                // Правки гасим после refetch: без мигания старых значений
                const { isError } = await schemaQuery.refetch();
                if (!isError) setEdits({});
            }
            return ok;
        } finally {
            setSaving(false);
        }
    };

    return {
        schema,
        values,
        loading: schemaQuery.isPending,
        dirty,
        saving,
        setValue,
        save,
    };
}
