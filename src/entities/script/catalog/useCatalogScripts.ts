import { useQuery } from '@tanstack/react-query';

export function useCatalogScripts() {
    const { data, isPending, error, refetch } = useQuery({
        queryKey: ['catalog:scripts:list'],
        queryFn: () => window.catalog.scripts.list(),
    });

    return {
        scripts: data ?? [],
        loading: isPending,
        error,
        refresh: () => void refetch(),
    };
}
