import { useEffect, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';

import { i18n, type SupportedLocale } from '@/shared/i18n';
import { STORAGE } from '@/shared/config/storage-keys';

export function I18nProvider({ children }: { children: ReactNode }) {
    useEffect(() => {
        const onLangChange = (lang: string) => { STORAGE.lang.set(lang as SupportedLocale); };
        i18n.on('languageChanged', onLangChange);
        return () => { i18n.off('languageChanged', onLangChange); };
    }, []);
    return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
