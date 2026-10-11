import type { ComponentType, SVGProps } from 'react';
import {
    DownloadIcon,
    FileCode2Icon,
    KeyboardIcon,
    LibraryIcon,
    ScrollTextIcon,
    SettingsIcon,
} from 'lucide-react';

export type SectionGroup = 'local' | 'sources' | 'misc' | 'footer';

export type Section = {
    path: string
    /** Ключ i18n заголовка: он же подпись в сайдбаре и в шапке. */
    i18nKey: string
    icon: ComponentType<SVGProps<SVGSVGElement>>
    group: SectionGroup
};

const ROWS = [
    { path: '/scripts', i18nKey: 'nav.scripts', icon: FileCode2Icon, group: 'local' },
    { path: '/get-scripts', i18nKey: 'nav.getScripts', icon: DownloadIcon, group: 'sources' },
    { path: '/libraries', i18nKey: 'nav.libraries', icon: LibraryIcon, group: 'sources' },
    { path: '/binds', i18nKey: 'nav.binds', icon: KeyboardIcon, group: 'misc' },
    { path: '/changelog', i18nKey: 'nav.changelog', icon: ScrollTextIcon, group: 'footer' },
    { path: '/settings', i18nKey: 'nav.settings', icon: SettingsIcon, group: 'footer' },
] as const satisfies readonly Section[];

export type SectionPath = (typeof ROWS)[number]['path'];

/** Единая таблица: сайдбар, шапка и роутер читают её. */
export const SECTIONS: readonly Section[] = ROWS;

/** Группы с заголовком в сайдбаре; footer без заголовка. */
export const SIDEBAR_GROUPS = ['local', 'sources', 'misc'] as const satisfies readonly SectionGroup[];
