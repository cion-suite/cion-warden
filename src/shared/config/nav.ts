import { FileCode2, Download, Library, Keyboard, Settings } from 'lucide-react';

import type { NavItem, NavSection } from '@/shared/types/nav';
import { ROUTES } from './routes.js';

export const NAV_ITEMS: readonly NavItem[] = [
    { path: ROUTES.scripts, i18nKey: 'nav.scripts', icon: FileCode2, section: 'local' },
    { path: ROUTES.getScripts, i18nKey: 'nav.getScripts', icon: Download, section: 'sources' },
    { path: ROUTES.libraries, i18nKey: 'nav.libraries', icon: Library, section: 'sources' },
    { path: ROUTES.binds, i18nKey: 'nav.binds', icon: Keyboard, section: 'misc' },
    { path: ROUTES.settings, i18nKey: 'nav.settings', icon: Settings, section: 'footer' },
] as const;

export const NAV_BY_SECTION: Readonly<Record<NavSection, readonly NavItem[]>> = NAV_ITEMS.reduce(
    (acc, item) => {
        (acc[item.section] as NavItem[]).push(item);
        return acc;
    },
    { local: [] as NavItem[], sources: [] as NavItem[], misc: [] as NavItem[], footer: [] as NavItem[] },
);

export function findNavItem(pathname: string): NavItem | undefined {
    return NAV_ITEMS.find((item) => item.path === pathname);
}
