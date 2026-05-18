import { House, Settings } from 'lucide-react';

import type { NavItem, NavSection } from '@/shared/types/nav';
import { ROUTES } from './routes.js';

export const NAV_ITEMS: readonly NavItem[] = [
    { path: ROUTES.home, i18nKey: 'nav.home', icon: House, section: 'main' },
    { path: ROUTES.settings, i18nKey: 'nav.settings', icon: Settings, section: 'footer' },
] as const;

export const NAV_BY_SECTION: Readonly<Record<NavSection, readonly NavItem[]>> = NAV_ITEMS.reduce(
    (acc, item) => {
        (acc[item.section] as NavItem[]).push(item);
        return acc;
    },
    { main: [] as NavItem[], footer: [] as NavItem[] }
);

export function findNavItem(pathname: string): NavItem | undefined {
    return NAV_ITEMS.find((item) => item.path === pathname);
}
