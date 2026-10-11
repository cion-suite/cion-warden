import { logger, settings, state as coreState } from '@cion-suite/core/renderer';

import { SUPPORTED_LOCALES } from '@/lib/i18n/resources';
import type { UiState } from '@/lib/types/state';
import type { Theme } from '@shared/settings';

const UI_STATE_DEFAULTS: UiState = {
    lastRoute: '/scripts',
    sidebarOpen: true,
    lastShownChangelogVersion: '',
};

/** След интерфейса: localStorage, ключи `state:*`. */
export const state = coreState.create<UiState>({ defaults: UI_STATE_DEFAULTS });

const LEGACY = {
    locale: 'cion-warden:lang',
    sidebarOpen: 'cion-warden:sidebar-open',
    lastRoute: 'cion-warden:last-route',
    theme: 'theme',
} as const;

const THEMES: readonly Theme[] = ['light', 'dark', 'system'];

function readJson(key: string): unknown {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? undefined : JSON.parse(raw);
    } catch {
        return undefined;
    }
}

/**
 * Разовый перенос ключей старого UI в settings и state.
 * Вызывать до initI18n: язык читается из settings.
 */
export function migrateLegacyState(): void {
    try {
        const upgraded = [LEGACY.locale, LEGACY.sidebarOpen, LEGACY.lastRoute].some(
            (key) => localStorage.getItem(key) !== null,
        );
        if (!upgraded) return;

        const locale = SUPPORTED_LOCALES.find((code) => code === readJson(LEGACY.locale));
        if (locale) void settings.set('locale', locale);

        // Старый UI показывал dark, а файл settings хранит system
        const rawTheme = localStorage.getItem(LEGACY.theme);
        void settings.set('theme', THEMES.find((theme) => theme === rawTheme) ?? 'dark');

        const sidebarOpen = readJson(LEGACY.sidebarOpen);
        if (typeof sidebarOpen === 'boolean') state.set('sidebarOpen', sidebarOpen);

        const lastRoute = readJson(LEGACY.lastRoute);
        if (typeof lastRoute === 'string' && lastRoute !== '/' && lastRoute.startsWith('/')) {
            state.set('lastRoute', lastRoute);
        }

        for (const key of Object.values(LEGACY)) localStorage.removeItem(key);
    } catch (e) {
        logger.warn('Legacy state migration failed', e);
    }
}
