import { beforeEach, describe, expect, it, vi } from 'vitest';

const shell = vi.hoisted(() => ({ showItemInFolder: vi.fn() }));
const binds = vi.hoisted(() => ({
    install: vi.fn(),
    sync: vi.fn(),
    remove: vi.fn(),
    local: vi.fn(),
    schema: vi.fn(),
    values: { get: vi.fn(), save: vi.fn(), reset: vi.fn() },
}));
const catalog = vi.hoisted(() => ({ metas: vi.fn() }));

vi.mock('electron', () => ({ shell }));
vi.mock('@app/catalog', () => ({ catalog }));
vi.mock('@app/binds/files', () => ({ binds }));

import { bindsHandlers } from '@app/binds/handlers';
import { schema } from '@shared/schema';

beforeEach(() => {
    for (const fn of [shell.showItemInFolder, catalog.metas, binds.local]) fn.mockReset();
});

describe('binds:list', () => {
    it('отдаёт только пресеты каталога, sourceId необязателен', async () => {
        catalog.metas.mockResolvedValue({ scripts: [], libs: [], presets: [{ id: 'p' }] });

        await expect(bindsHandlers['binds:list'].handle('a')).resolves.toEqual([{ id: 'p' }]);
        await expect(bindsHandlers['binds:list'].handle(undefined)).resolves.toEqual([{ id: 'p' }]);
        expect(catalog.metas).toHaveBeenNthCalledWith(2, undefined);
    });
});

describe('binds:folder:open', () => {
    it('показывает файл схемы в проводнике', async () => {
        binds.local.mockResolvedValue('C:\\v\\presets\\a.ahk');

        await bindsHandlers['binds:folder:open'].handle('s', 'p');

        expect(binds.local).toHaveBeenCalledWith('s', 'p');
        expect(shell.showItemInFolder).toHaveBeenCalledWith('C:\\v\\presets\\a.ahk');
    });

    it('схема не скачана - ошибка, проводник не открывается', async () => {
        binds.local.mockRejectedValue(new Error('not downloaded'));

        await expect(bindsHandlers['binds:folder:open'].handle('s', 'p')).rejects.toThrow('not downloaded');
        expect(shell.showItemInFolder).not.toHaveBeenCalled();
    });
});

describe('схемы аргументов', () => {
    it('id источника и непустой id пресета', () => {
        const names = [
            'binds:install',
            'binds:delete',
            'binds:folder:open',
            'binds:schema:get',
            'binds:values:get',
            'binds:values:reset',
        ] as const;
        for (const name of names) {
            const [source, id] = bindsHandlers[name].args;
            expect(source, name).toBe(schema.source.id);
            expect(id.safeParse('').success, name).toBe(false);
        }
    });

    it('values:save: значения - примитивы вида section.field', () => {
        const [, , values] = bindsHandlers['binds:values:save'].args;

        expect(values.safeParse({ 'keys.jump': 'F1', 'tune.speed': 5 }).success).toBe(true);
        expect(values.safeParse({ 'keys.jump': { x: 1 } }).success).toBe(false);
        expect(values.safeParse({ '__proto__.polluted': 'yes' }).success).toBe(false);
    });

    it('sync: sourceId необязателен', () => {
        const [arg] = bindsHandlers['binds:sync'].args;

        expect(arg.safeParse(undefined).success).toBe(true);
        expect(arg.safeParse('../x').success).toBe(false);
    });
});

describe('делегирование', () => {
    it('каналы проводятся в функции binds', () => {
        expect(bindsHandlers['binds:install'].handle).toBe(binds.install);
        expect(bindsHandlers['binds:sync'].handle).toBe(binds.sync);
        expect(bindsHandlers['binds:delete'].handle).toBe(binds.remove);
        expect(bindsHandlers['binds:schema:get'].handle).toBe(binds.schema);
        expect(bindsHandlers['binds:values:get'].handle).toBe(binds.values.get);
        expect(bindsHandlers['binds:values:save'].handle).toBe(binds.values.save);
        expect(bindsHandlers['binds:values:reset'].handle).toBe(binds.values.reset);
    });
});
