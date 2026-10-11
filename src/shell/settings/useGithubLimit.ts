import { useQuery } from '@tanstack/react-query';

/** Квоты GitHub API; обновляет событие github:limit:changed. */
export function useGithubLimit() {
    const { data, isPending, isFetching, error, refetch } = useQuery({
        queryKey: ['github:limit:get'],
        queryFn: () => window.github.limit.get(),
        // Токены меняют список, скачивание тратит квоту без события
        staleTime: 0,
    });

    return { entries: data?.entries ?? [], isPending, isFetching, error, refetch };
}
