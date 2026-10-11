import { useQuery } from '@tanstack/react-query';

export function useBinds() {
    const query = useQuery({
        queryKey: ['binds:list'],
        queryFn: () => window.binds.list(),
    });
    return {
        binds: query.data ?? [],
        loading: query.isPending,
        error: query.error,
        refresh: () => void query.refetch(),
    };
}
