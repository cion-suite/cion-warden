import { useQuery } from '@tanstack/react-query';

export function useLibs() {
    const query = useQuery({
        queryKey: ['libs:list'],
        queryFn: () => window.libs.list(),
    });

    return {
        libs: query.data ?? [],
        loading: query.isPending,
        error: query.error,
        refresh: () => void query.refetch(),
    };
}
