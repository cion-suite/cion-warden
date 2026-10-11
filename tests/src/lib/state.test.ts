import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { migrateLegacyState, state } from '@/lib/state';

const settingsSet = vi.hoisted(() => vi.fn());

vi.mock('@cion-suite/core/renderer', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@cion-suite/core/renderer')>()),
    settings: { set: settingsSet },
}));

function memoryStorage() {
    const map = new Map<string, string>();
    return {
        map,
        getItem: (key: string) => map.get(key) ?? null,
        setItem: (key: string, value: string) => void map.set(key, value),
        removeItem: (key: string) => void map.delete(key),
    };
}

let local: ReturnType<typeof memoryStorage>;

beforeEach(() => {
    local = memoryStorage();
    vi.stubGlobal('localStorage', local);
    settingsSet.mockReset();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('state: след интерфейса в localStorage', () => {
    it('пустое хранилище -> дефолты', () => {
        expect(state.get('lastRoute')).toBe('/scripts');
        expect(state.get('sidebarOpen')).toBe(true);
        expect(state.get('lastShownChangelogVersion')).toBe('');
    });

    it('set пишет в ключ state:<kebab>', () => {
        state.set('lastRoute', '/settings');

        expect(local.map.get('state:last-route')).toBe('"/settings"');
        expect(state.get('lastRoute')).toBe('/settings');
    });

    it('false сохраняется и не подменяется дефолтом', () => {
        state.set('sidebarOpen', false);

        expect(local.map.get('state:sidebar-open')).toBe('false');
        expect(state.get('sidebarOpen')).toBe(false);
    });
});

describe('migrateLegacyState: ключи старого UI', () => {
    const LEGACY_KEYS = ['cion-warden:lang', 'cion-warden:sidebar-open', 'cion-warden:last-route', 'theme'];

    it('нет признака апгрейда -> ничего не трогает, даже theme', () => {
        local.map.set('theme', 'light');

        migrateLegacyState();

        expect(settingsSet).not.toHaveBeenCalled();
        expect(local.map.get('theme')).toBe('light');
        expect(state.get('lastRoute')).toBe('/scripts');
    });

    it('полный набор -> settings и state, старые ключи удалены', () => {
        local.map.set('cion-warden:lang', '"ru"');
        local.map.set('theme', 'light');
        local.map.set('cion-warden:sidebar-open', 'false');
        local.map.set('cion-warden:last-route', '"/binds"');

        migrateLegacyState();

        expect(settingsSet).toHaveBeenCalledWith('locale', 'ru');
        expect(settingsSet).toHaveBeenCalledWith('theme', 'light');
        expect(state.get('sidebarOpen')).toBe(false);
        expect(state.get('lastRoute')).toBe('/binds');
        for (const key of LEGACY_KEYS) expect(local.map.has(key), key).toBe(false);
    });

    it('нет theme -> dark: старый UI показывал его по умолчанию', () => {
        local.map.set('cion-warden:last-route', '"/libraries"');

        migrateLegacyState();

        expect(settingsSet).toHaveBeenCalledWith('theme', 'dark');
        expect(settingsSet).not.toHaveBeenCalledWith('locale', expect.anything());
    });

    it('невалидная тема -> dark', () => {
        local.map.set('cion-warden:lang', '"en"');
        local.map.set('theme', 'sepia');

        migrateLegacyState();

        expect(settingsSet).toHaveBeenCalledWith('theme', 'dark');
    });

    it('last-route "/" не переносится', () => {
        local.map.set('cion-warden:last-route', '"/"');

        migrateLegacyState();

        expect(state.get('lastRoute')).toBe('/scripts');
        expect(local.map.has('cion-warden:last-route')).toBe(false);
    });

    it('битый JSON и чужой язык пропускаются, ключи удаляются', () => {
        local.map.set('cion-warden:lang', '"de"');
        local.map.set('cion-warden:sidebar-open', '{broken');
        local.map.set('cion-warden:last-route', 'not-json');

        migrateLegacyState();

        expect(settingsSet).not.toHaveBeenCalledWith('locale', expect.anything());
        expect(state.get('sidebarOpen')).toBe(true);
        expect(state.get('lastRoute')).toBe('/scripts');
        for (const key of LEGACY_KEYS) expect(local.map.has(key), key).toBe(false);
    });

    it('повторный запуск - no-op', () => {
        local.map.set('cion-warden:lang', '"ru"');

        migrateLegacyState();
        settingsSet.mockClear();
        migrateLegacyState();

        expect(settingsSet).not.toHaveBeenCalled();
    });
});
