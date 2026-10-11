import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ConfigValues } from '@shared/types';

import { useConfigForm } from '@/kit/config-form';
import { useInvalidate } from '@/lib/hooks/useInvalidate';
import { useT } from '@/lib/i18n';
import { toast } from '@/ui/toast';

export function useScriptConfig(scriptId: string, onSaved: () => void) {
    const t = useT();
    const invalidate = useInvalidate();

    // Файл правят снаружи: кеш не держим, открытие читает заново
    const { data, isPending, error } = useQuery({
        queryKey: ['scripts:config:get', scriptId],
        queryFn: () => window.scripts.config.get(scriptId),
        gcTime: 0,
        retry: false,
    });

    useEffect(() => {
        if (error) toast.error(t('error'), { cause: error });
    }, [error, t]);

    const schema = data ?? null;

    const save = async (edits: ConfigValues): Promise<boolean> => {
        const ok = await toast.result(window.scripts.config.save(scriptId, edits), { error: t('error') });
        if (!ok) return false;
        // Форма гасит правки по свежим данным: без старых значений
        await invalidate('scripts:config:get');
        onSaved();
        return true;
    };

    const form = useConfigForm(schema, save);

    return { schema, loading: isPending, ...form };
}
