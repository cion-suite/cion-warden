import { useQuery } from '@tanstack/react-query';

import { useInvalidate } from '@/lib/hooks/useInvalidate';

export function useScripts() {
    const invalidate = useInvalidate();
    const list = useQuery({ queryKey: ['scripts:list'], queryFn: () => window.scripts.list() });
    // Внешние процессы AutoHotkey событий не дают,
    // поэтому читаем на каждый mount
    const processes = useQuery({
        queryKey: ['scripts:processes:get'],
        queryFn: () => window.scripts.processes.get(),
        staleTime: 0,
    });

    return {
        scripts: list.data ?? [],
        loading: list.isPending,
        error: list.error,
        running: processes.data ?? false,
        refresh: () => void invalidate('scripts:list', 'scripts:processes:get'),
    };
}
