// uiTheme: класс на <html> по prefers-color-scheme.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { uiTheme } from '@/ui/theme/apply-theme';

let dark = false;
let onChange: () => void;
const classes = new Set<string>();

beforeEach(() => {
    dark = false;
    classes.clear();
    vi.stubGlobal('window', {
        matchMedia: () => ({
            get matches() {
                return dark;
            },
            addEventListener: (_: string, handler: () => void) => {
                onChange = handler;
            },
        }),
        document: {
            documentElement: {
                classList: {
                    remove: (...names: string[]) => names.forEach((name) => classes.delete(name)),
                    add: (name: string) => classes.add(name),
                },
            },
        },
    });
});

describe('uiTheme.follow', () => {
    it('ставит класс по matchMedia', () => {
        dark = true;
        uiTheme.follow();

        expect([...classes]).toEqual(['dark']);
    });

    it('событие change перекрашивает html', () => {
        uiTheme.follow();
        expect([...classes]).toEqual(['light']);

        dark = true;
        onChange();

        expect([...classes]).toEqual(['dark']);
    });
});

describe('uiTheme.resolve', () => {
    it.each([
        [false, 'light'],
        [true, 'dark'],
    ])("'system' следует matchMedia (dark=%s)", (isDark, expected) => {
        dark = isDark;

        expect(uiTheme.resolve('system')).toBe(expected);
    });

    it.each(['dark', 'light'] as const)("'%s' возвращается как есть", (theme) => {
        dark = theme === 'light';

        expect(uiTheme.resolve(theme)).toBe(theme);
    });
});
