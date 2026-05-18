import { defineStorage } from '@/shared/lib/local-storage';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type SupportedLocale } from '@/shared/i18n';

export const STORAGE = {
    sidebarOpen: defineStorage<boolean>({
        key: 'cion-template:sidebar-open',
        default: true,
    }),
    lang: defineStorage<SupportedLocale>({
        key: 'cion-template:lang',
        default: DEFAULT_LOCALE,
        validate: (v): v is SupportedLocale =>
            typeof v === 'string' && SUPPORTED_LOCALES.includes(v as SupportedLocale),
    }),
    lastRoute: defineStorage<string>({
        key: 'cion-template:last-route',
        default: '/',
    }),
};
