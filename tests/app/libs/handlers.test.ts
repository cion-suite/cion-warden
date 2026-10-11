import { beforeEach, describe, expect, it, vi } from 'vitest';

const shell = vi.hoisted(() => ({ showItemInFolder: vi.fn(), openExternal: vi.fn() }));
const libs = vi.hoisted(() => ({
    install: vi.fn(),
    sync: vi.fn(),
    remove: vi.fn(),
    local: vi.fn(),
    url: vi.fn(),
}));
const catalog = vi.hoisted(() => ({ metas: vi.fn() }));

vi.mock('electron', () => ({ shell }));
vi.mock('@app/catalog', () => ({ catalog }));
vi.mock('@app/libs/files', () => ({ libs }));

import { libsHandlers } from '@app/libs/handlers';
import { schema } from '@shared/schema';

beforeEach(() => {
    for (const fn of [...Object.values(shell), ...Object.values(libs), catalog.metas]) fn.mockReset();
});

describe('libs:list', () => {
    it('отдаёт только lib каталога, sourceId необязателен', async () => {
        catalog.metas.mockResolvedValue({ scripts: [], libs: [{ id: 'l' }], presets: [] });

        await expect(libsHandlers['libs:list'].handle('a')).resolves.toEqual([{ id: 'l' }]);
        await expect(libsHandlers['libs:list'].handle(undefined)).resolves.toEqual([{ id: 'l' }]);
        expect(catalog.metas).toHaveBeenNthCalledWith(2, undefined);
    });
});

describe('libs:folder:open', () => {
    it('показывает локальную копию в проводнике', async () => {
        libs.local.mockResolvedValue('C:\\v\\lib\\a.ahk');

        await libsHandlers['libs:folder:open'].handle('s', 'l');

        expect(libs.local).toHaveBeenCalledWith('s', 'l');
        expect(shell.showItemInFolder).toHaveBeenCalledWith('C:\\v\\lib\\a.ahk');
    });

    it('нет локальной копии - ошибка, проводник не открывается', async () => {
        libs.local.mockRejectedValue(new Error('not downloaded'));

        await expect(libsHandlers['libs:folder:open'].handle('s', 'l')).rejects.toThrow('not downloaded');
        expect(shell.showItemInFolder).not.toHaveBeenCalled();
    });
});

describe('libs:web:open', () => {
    it('открывает webUrl в браузере', async () => {
        libs.url.mockResolvedValue('https://github.com/o/r');

        await libsHandlers['libs:web:open'].handle('s', 'l');

        expect(shell.openExternal).toHaveBeenCalledWith('https://github.com/o/r');
    });

    it('lib без webUrl - ошибка, браузер не открывается', async () => {
        libs.url.mockRejectedValue(new Error('no url'));

        await expect(libsHandlers['libs:web:open'].handle('s', 'l')).rejects.toThrow('no url');
        expect(shell.openExternal).not.toHaveBeenCalled();
    });
});

describe('схемы аргументов', () => {
    it('id источника и непустой id lib', () => {
        for (const name of ['libs:install', 'libs:delete', 'libs:folder:open', 'libs:web:open'] as const) {
            const [source, id] = libsHandlers[name].args;
            expect(source, name).toBe(schema.source.id);
            expect(id.safeParse('').success, name).toBe(false);
        }
    });

    it('sync: sourceId необязателен', () => {
        const [arg] = libsHandlers['libs:sync'].args;

        expect(arg.safeParse(undefined).success).toBe(true);
        expect(arg.safeParse('../x').success).toBe(false);
    });
});

describe('делегирование', () => {
    it('install, sync, delete - функции libs', () => {
        expect(libsHandlers['libs:install'].handle).toBe(libs.install);
        expect(libsHandlers['libs:sync'].handle).toBe(libs.sync);
        expect(libsHandlers['libs:delete'].handle).toBe(libs.remove);
    });
});
