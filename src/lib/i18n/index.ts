import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import { settings, useSetting } from '@cion-suite/core/renderer';

import { DEFAULT_LOCALE, resources, SUPPORTED_LOCALES, type SupportedLocale } from './resources';

export { DEFAULT_LOCALE, SUPPORTED_LOCALES, type SupportedLocale };
export { i18n };

/** Язык задаёт settings 'locale', i18next лишь следует. */
export function initI18n(): void {
    void i18n.use(initReactI18next).init({
        resources,
        lng: settings.get('locale'),
        fallbackLng: DEFAULT_LOCALE,
        defaultNS: 'common',
        ns: ['common'],
        interpolation: { escapeValue: false },
        returnNull: false,
    });
    settings.on('locale', (locale) => void i18n.changeLanguage(locale));
}

export function useT() {
    return useTranslation('common').t;
}

export function useLocale(): SupportedLocale {
    return useSetting('locale');
}
