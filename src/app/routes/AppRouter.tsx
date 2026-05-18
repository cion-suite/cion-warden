import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { Layout } from '@/widgets/app-layout';
import { ROUTES } from '@/shared/config/routes';
import { STORAGE } from '@/shared/config/storage-keys';

const HomePage = lazy(() => import('@/pages/home').then((m) => ({ default: m.HomePage })));
const SettingsPage = lazy(() =>
    import('@/pages/settings').then((m) => ({ default: m.SettingsPage }))
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
                    <Route path={ROUTES.home} element={<HomePage />} />
                    <Route path={ROUTES.settings} element={<SettingsPage />} />
                </Route>
                <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
            </Routes>
        </Suspense>
    );
}
