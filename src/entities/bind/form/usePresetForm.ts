import { useQuery } from '@tanstack/react-query';
import type { ConfigValues } from '@shared/types';

import { useConfigForm } from '@/kit/config-form';
import { useT } from '@/lib/i18n';
import { toast } from '@/ui/toast';

export function usePresetForm(sourceId: string, presetId: string) {
    const t = useT();

    const schemaQuery = useQuery({
        queryKey: ['binds:schema:get', sourceId, presetId],
        queryFn: () => window.binds.schema.get(sourceId, presetId),
    });

    const schema = schemaQuery.data ?? null;

    const save = async (edits: ConfigValues): Promise<boolean> => {
        const ok = await toast.result(window.binds.values.save(sourceId, presetId, edits), {
            success: t('binds.saved'),
            error: t('error'),
        });
        if (!ok) return false;
        // Правки гасятся после refetch: без мигания старых значений
        const { isError } = await schemaQuery.refetch();
        return !isError;
    };

    const form = useConfigForm(schema, save);

    return { schema, loading: schemaQuery.isPending, ...form };
}
