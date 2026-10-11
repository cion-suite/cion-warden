// start: тема до первого окна, дальше за настройкой.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const order = vi.hoisted(() => [] as string[]);
const shell = vi.hoisted(() => ({
    splash: { open: vi.fn() },
    theme: { set: vi.fn() },
}));
const core = vi.hoisted(() => ({ get: vi.fn(), on: vi.fn() }));

vi.mock('@app/shell', () => ({ shell }));
vi.mock('@cion-suite/core', async (importOriginal) => ({
    ...await importOriginal<typeof import('@cion-suite/core')>(),
    settings: { get: core.get, on: core.on },
}));

import { shellModule } from '@app/shell/module';

beforeEach(() => {
    order.length = 0;
    core.get.mockReset().mockReturnValue('dark');
    core.on.mockReset();
    shell.theme.set.mockReset().mockImplementation(() => order.push('theme'));
    shell.splash.open.mockReset().mockImplementation(async () => {
        order.push('splash');
    });
});

describe('shellModule.start', () => {
    it('тема ставится до splash, splash отдаётся ядру', async () => {
        await shellModule.start?.();

        expect(shell.theme.set).toHaveBeenCalledWith('dark');
        expect(order).toEqual(['theme', 'splash']);
    });

    it('смена настройки theme переставляет nativeTheme', async () => {
        await shellModule.start?.();

        expect(core.on).toHaveBeenCalledWith('theme', shell.theme.set);
    });
});
