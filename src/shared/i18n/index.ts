import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';

import type { SupportedLocale } from '@/shared/types/i18n';
import { DEFAULT_LOCALE, resources, SUPPORTED_LOCALES } from './resources.js';

export { DEFAULT_LOCALE, SUPPORTED_LOCALES };
export type { SupportedLocale };

export function initI18n(locale: SupportedLocale = DEFAULT_LOCALE): typeof i18n {
    if (i18n.isInitialized) {
        if (i18n.language !== locale) void i18n.changeLanguage(locale);
        return i18n;
    }
    void i18n.use(initReactI18next).init({
        resources,
        lng: locale,
        fallbackLng: DEFAULT_LOCALE,
        defaultNS: 'common',
        ns: ['common'],
        interpolation: { escapeValue: false },
        returnNull: false,
    });
    return i18n;
}

export function useT(namespace: 'common' = 'common') {
    return useTranslation(namespace).t;
}

export function useLocale(): SupportedLocale {
    return (useTranslation().i18n.language as SupportedLocale) ?? DEFAULT_LOCALE;
}

export { i18n };
