import { useQuery } from '@tanstack/react-query';

import { useInvalidate } from '@/lib/hooks/useInvalidate';

export function useSources() {
    const { data, isPending } = useQuery({
        queryKey: ['sources:list'],
        queryFn: () => window.sources.list(),
    });
    return { sources: data ?? [], loading: isPending };
}

/** Источник влияет на все списки каталога и формы пресетов. */
export function useInvalidateSources() {
    const invalidate = useInvalidate();
    return () =>
        invalidate(
            'sources:list',
            'libs:list',
            'binds:list',
            'catalog:scripts:list',
            'binds:schema:get',
        );
}
