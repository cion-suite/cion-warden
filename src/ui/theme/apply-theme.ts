import type { SettingsMap } from '@cion-suite/core/renderer';

type ThemeSetting = SettingsMap['theme'];

const query = () => window.matchMedia('(prefers-color-scheme: dark)');

const paint = () => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(query().matches ? 'dark' : 'light');
};

export const uiTheme = {
    /** Класс на <html> по prefers-color-scheme; тему окна
     * задаёт main (nativeTheme). */
    follow() {
        paint();
        query().addEventListener('change', paint);
    },
    resolve: (theme: ThemeSetting): 'dark' | 'light' =>
        theme === 'system' ? (query().matches ? 'dark' : 'light') : theme,
};
