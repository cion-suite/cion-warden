import { beforeEach, describe, expect, it, vi } from 'vitest';

const catalog = vi.hoisted(() => ({ metas: vi.fn() }));
const sync = vi.hoisted(() => vi.fn());
const install = vi.hoisted(() => vi.fn());

vi.mock('@app/catalog', () => ({ catalog }));
vi.mock('@app/catalog/sync', () => ({ sync }));
vi.mock('@app/catalog/install', () => ({ install }));

import { catalogHandlers } from '@app/catalog/handlers';
import { schema } from '@shared/schema';

beforeEach(() => {
    catalog.metas.mockReset().mockResolvedValue({ scripts: [{ id: 's' }], libs: [{ id: 'l' }], presets: [{ id: 'p' }] });
});

describe('catalog:scripts:list', () => {
    it('отдаёт только скрипты, sourceId необязателен', async () => {
        const entry = catalogHandlers['catalog:scripts:list'];

        await expect(entry.handle('a')).resolves.toEqual([{ id: 's' }]);
        await expect(entry.handle(undefined)).resolves.toEqual([{ id: 's' }]);
        expect(catalog.metas).toHaveBeenNthCalledWith(1, 'a');
        expect(catalog.metas).toHaveBeenNthCalledWith(2, undefined);
    });
});

describe('схемы аргументов', () => {
    it('sync: sourceId необязателен, но не произвольная строка', () => {
        const [arg] = catalogHandlers['catalog:sync'].args;

        expect(arg.safeParse(undefined).success).toBe(true);
        expect(arg.safeParse('abc-1').success).toBe(true);
        expect(arg.safeParse('../x').success).toBe(false);
    });

    it('install: id источника и имя файла без метасимволов', () => {
        const [id, name] = catalogHandlers['catalog:scripts:install'].args;

        expect(id).toBe(schema.source.id);
        expect(name).toBe(schema.file.name);
        expect(name.safeParse('ok.ahk').success).toBe(true);
        for (const bad of ['', '..', 'a/b.ahk', 'a\\b.ahk', 'a&b.ahk']) expect(name.safeParse(bad).success, bad).toBe(false);
    });
});

describe('делегирование', () => {
    it('sync и install - функции catalog', () => {
        expect(catalogHandlers['catalog:sync'].handle).toBe(sync);
        expect(catalogHandlers['catalog:scripts:install'].handle).toBe(install);
    });
});
