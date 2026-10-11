import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { state } from '@/lib/state';

/** Пишет путь в state: последний раздел для DefaultRedirect. */
export function usePersistLastRoute(): void {
    const { pathname } = useLocation();

    useEffect(() => {
        if (pathname !== '/') state.set('lastRoute', pathname);
    }, [pathname]);
}
