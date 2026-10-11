import { beforeEach, describe, expect, it, vi } from 'vitest';

const installer = vi.hoisted(() => ({ list: vi.fn(), install: vi.fn(), remove: vi.fn() }));
const store = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@app/fonts/installer', () => ({ installer }));
vi.mock('@app/sources/store', () => ({ store }));

import { fontsHandlers } from '@app/fonts/handlers';
import { schema } from '@shared/schema';

const source = { id: 'a', type: 'git', name: 'o/r', url: 'https://github.com/o/r', branch: 'main', isPrivate: false };

beforeEach(() => {
    for (const fn of [...Object.values(installer), store.get]) fn.mockReset();
    store.get.mockResolvedValue(source);
});

describe('fonts:list', () => {
    it('отдаёт установленные шрифты', async () => {
        installer.list.mockResolvedValue([{ assetId: 'a:font:x.ttf' }]);

        await expect(fontsHandlers['fonts:list']()).resolves.toEqual([{ assetId: 'a:font:x.ttf' }]);
    });
});

describe('fonts:install', () => {
    it('ставит шрифты найденного источника', async () => {
        installer.install.mockResolvedValue({ ok: 2, failed: 0, skipped: 1 });

        await expect(fontsHandlers['fonts:install'].handle('a')).resolves.toEqual({ ok: 2, failed: 0, skipped: 1 });
        expect(installer.install).toHaveBeenCalledWith(source);
    });

    it('неизвестный источник - отказ store, установка не стартует', async () => {
        store.get.mockRejectedValue(Object.assign(new Error('Source not found'), { code: 'not_found' }));

        await expect(fontsHandlers['fonts:install'].handle('zzz')).rejects.toThrow('not found');
        expect(installer.install).not.toHaveBeenCalled();
    });

    it('аргумент - id источника', () => {
        expect(fontsHandlers['fonts:install'].args).toEqual([schema.source.id]);
    });
});

describe('fonts:remove', () => {
    it('убирает шрифты источника без проверки его наличия', async () => {
        installer.remove.mockResolvedValue(undefined);

        await fontsHandlers['fonts:remove'].handle('gone');

        expect(installer.remove).toHaveBeenCalledWith('gone');
        expect(store.get).not.toHaveBeenCalled();
    });
});
