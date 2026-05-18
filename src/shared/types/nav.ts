import type { LucideIcon } from 'lucide-react';

import type { RoutePath } from './routes';

export type NavSection = 'main' | 'footer';

export interface NavItem {
    path: RoutePath;
    i18nKey: string;
    icon: LucideIcon;
    section: NavSection;
}
