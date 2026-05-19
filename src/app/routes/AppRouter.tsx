import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { Layout } from '@/widgets/app-layout';
import { ROUTES } from '@/shared/config/routes';
import { STORAGE } from '@/shared/config/storage-keys';

const SettingsPage = lazy(() =>
    import('@/pages/settings').then((m) => ({ default: m.SettingsPage }))
);
const ScriptsPage = lazy(() =>
    import('@/pages/scripts').then((m) => ({ default: m.ScriptsPage }))
);
const GetScriptsPage = lazy(() =>
    import('@/pages/get-scripts').then((m) => ({ default: m.GetScriptsPage }))
);
const LibrariesPage = lazy(() =>
    import('@/pages/libraries').then((m) => ({ default: m.LibrariesPage }))
);
const BindsPage = lazy(() =>
    import('@/pages/binds').then((m) => ({ default: m.BindsPage }))
);

function RouteRestorer() {
    const { pathname } = useLocation();
    useEffect(() => { STORAGE.lastRoute.set(pathname); }, [pathname]);
    return null;
}

export function AppRouter() {
    return (
        <Suspense fallback={null}>
            <RouteRestorer />
            <Routes>
                <Route element={<Layout />}>
                    <Route path={ROUTES.scripts} element={<ScriptsPage />} />
                    <Route path={ROUTES.getScripts} element={<GetScriptsPage />} />
                    <Route path={ROUTES.libraries} element={<LibrariesPage />} />
                    <Route path={ROUTES.binds} element={<BindsPage />} />
                    <Route path={ROUTES.settings} element={<SettingsPage />} />
                </Route>
                <Route path="*" element={<Navigate to={ROUTES.scripts} replace />} />
            </Routes>
        </Suspense>
    );
}
