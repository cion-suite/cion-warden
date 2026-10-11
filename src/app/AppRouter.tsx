import type { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { state } from '@/lib/state';
import { Layout } from '@/shell/layout';
import type { SectionPath } from '@/shell/sidebar';
import ChangelogPage from '@/shell/update/ChangelogPage';
import SettingsPage from '@/shell/settings/SettingsPage';
import BindsPage from '@/entities/bind/grid/BindsPage';
import LibrariesPage from '@/entities/library/list/LibrariesPage';
import GetScriptsPage from '@/entities/script/catalog/GetScriptsPage';
import ScriptsPage from '@/entities/script/list/ScriptsPage';

// Ключ - раздел из SECTIONS: рассинхрон не скомпилируется
const PAGES: Record<SectionPath, ReactElement> = {
    '/scripts': <ScriptsPage />,
    '/get-scripts': <GetScriptsPage />,
    '/libraries': <LibrariesPage />,
    '/binds': <BindsPage />,
    '/changelog': <ChangelogPage />,
    '/settings': <SettingsPage />,
};

export const AppRouter = () => (
    <Routes>
        <Route path="" element={<Layout />}>
            <Route index element={<Navigate to={state.get('lastRoute')} replace />} />
            {Object.entries(PAGES).map(([path, element]) => (
                <Route key={path} path={path} element={element} />
            ))}
        </Route>

        <Route path="*" element={<Navigate to="/scripts" replace />} />
    </Routes>
);
