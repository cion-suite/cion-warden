import { beforeEach, describe, expect, it, vi } from 'vitest';

const order = vi.hoisted(() => [] as string[]);
const store = vi.hoisted(() => ({
    list: vi.fn(),
    get: vi.fn(),
    add: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
}));
const tokens = vi.hoisted(() => ({ mask: vi.fn(), set: vi.fn(), remove: vi.fn() }));
const events = vi.hoisted(() => ({ emit: vi.fn() }));
const log = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock('@app/sources/store', () => ({ store }));
vi.mock('@app/sources/tokens', () => ({ tokens }));
vi.mock('@cion-suite/core', async (importOriginal) => {
    const original = await importOriginal<typeof import('@cion-suite/core')>();
    return { ...original, events, logger: { ...original.logger, child: () => log } };
});

import { sourcesHandlers } from '@app/sources/handlers';

const record = { id: 'a', type: 'git', name: 'o/r', url: 'https://github.com/o/r', branch: 'main', isPrivate: true };

beforeEach(() => {
    order.length = 0;
    for (const fn of [...Object.values(store), ...Object.values(tokens), events.emit, log.warn]) fn.mockReset();
    store.list.mockResolvedValue([record]);
    store.get.mockResolvedValue(record);
    store.add.mockResolvedValue(record);
    store.update.mockResolvedValue(record);
    store.remove.mockImplementation(async () => void order.push('record'));
    tokens.mask.mockResolvedValue('ghp_a***p');
    tokens.set.mockResolvedValue(undefined);
    tokens.remove.mockImplementation(async () => void order.push('token'));
});

describe('sources:list', () => {
    it('источники с маской токена', async () => {
        await expect(sourcesHandlers['sources:list']()).resolves.toEqual([{ ...record, tokenMask: 'ghp_a***p' }]);
    });

    it('сбой vault на маске: источник остаётся, маска null, warn', async () => {
        tokens.mask.mockRejectedValue(new Error('vault'));

        await expect(sourcesHandlers['sources:list']()).resolves.toEqual([{ ...record, tokenMask: null }]);
        expect(log.warn).toHaveBeenCalledTimes(1);
    });

    it('битый sources.json пробрасывается', async () => {
        store.list.mockRejectedValue(new Error('sources.json is corrupted'));

        await expect(sourcesHandlers['sources:list']()).rejects.toThrow('corrupted');
    });
});

describe('sources:add', () => {
    it('добавляет, эмитит add и возвращает Source', async () => {
        const options = { type: 'git', url: record.url, branch: 'main', isPrivate: true } as const;

        const result = await sourcesHandlers['sources:add'].handle(options);

        expect(store.add).toHaveBeenCalledWith(options);
        expect(events.emit).toHaveBeenCalledWith('source:changed', { sourceId: 'a', type: 'add' });
        expect(result).toEqual({ ...record, tokenMask: 'ghp_a***p' });
    });
});

describe('sources:update', () => {
    it('обновляет и эмитит update; токен не трогает', async () => {
        await sourcesHandlers['sources:update'].handle('a', { branch: 'dev' });

        expect(store.update).toHaveBeenCalledWith('a', { branch: 'dev' });
        expect(tokens.remove).not.toHaveBeenCalled();
        expect(events.emit).toHaveBeenCalledWith('source:changed', { sourceId: 'a', type: 'update' });
    });

    it('isPrivate: false удаляет токен', async () => {
        await sourcesHandlers['sources:update'].handle('a', { isPrivate: false });

        expect(tokens.remove).toHaveBeenCalledWith('a');
    });

    it('ошибка vault при удалении токена пробрасывается без события', async () => {
        tokens.remove.mockRejectedValue(new Error('vault'));

        await expect(sourcesHandlers['sources:update'].handle('a', { isPrivate: false })).rejects.toThrow('vault');
        expect(events.emit).not.toHaveBeenCalled();
    });
});

describe('sources:remove', () => {
    it('токен раньше записи, событие последним', async () => {
        events.emit.mockImplementation(() => void order.push('event'));

        await sourcesHandlers['sources:remove'].handle('a');

        expect(order).toEqual(['token', 'record', 'event']);
        expect(events.emit).toHaveBeenCalledWith('source:changed', { sourceId: 'a', type: 'remove' });
    });

    it('сбой vault - запись цела, события нет', async () => {
        tokens.remove.mockRejectedValue(new Error('vault'));

        await expect(sourcesHandlers['sources:remove'].handle('a')).rejects.toThrow('vault');
        expect(store.remove).not.toHaveBeenCalled();
        expect(events.emit).not.toHaveBeenCalled();
    });

    it('нет записи - отказ store пробрасывается без события', async () => {
        store.remove.mockRejectedValue(new Error('Source not found'));

        await expect(sourcesHandlers['sources:remove'].handle('a')).rejects.toThrow('not found');
        expect(events.emit).not.toHaveBeenCalled();
    });
});

describe('sources:token:set / remove', () => {
    it('set: сначала источник, потом vault, эмитит update', async () => {
        await sourcesHandlers['sources:token:set'].handle('a', 'ghp_x');

        expect(store.get).toHaveBeenCalledWith('a');
        expect(tokens.set).toHaveBeenCalledWith('a', 'ghp_x');
        expect(events.emit).toHaveBeenCalledWith('source:changed', { sourceId: 'a', type: 'update' });
    });

    it('set: неизвестный источник - vault не тронут', async () => {
        store.get.mockRejectedValue(new Error('Source not found'));

        await expect(sourcesHandlers['sources:token:set'].handle('zzz', 'ghp_x')).rejects.toThrow('not found');
        expect(tokens.set).not.toHaveBeenCalled();
    });

    it('remove: удаляет токен и эмитит update', async () => {
        await sourcesHandlers['sources:token:remove'].handle('a');

        expect(tokens.remove).toHaveBeenCalledWith('a');
        expect(events.emit).toHaveBeenCalledWith('source:changed', { sourceId: 'a', type: 'update' });
    });
});
