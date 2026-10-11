import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (payload: never) => void;

const bus = vi.hoisted(() => ({ listeners: new Map<string, Set<Listener>>() }));
const events = vi.hoisted(() => ({
    on: vi.fn((name: string, handler: Listener) => {
        const set = bus.listeners.get(name) ?? new Set<Listener>();
        set.add(handler);
        bus.listeners.set(name, set);
        return () => set.delete(handler);
    }),
}));
const installer = vi.hoisted(() => ({
    install: vi.fn(),
    remove: vi.fn(),
    prune: vi.fn(),
    all: vi.fn(),
}));
const store = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn() }));
const log = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock('@app/fonts/installer', () => ({ installer }));
vi.mock('@app/sources/store', () => ({ store }));
vi.mock('@cion-suite/core', async (importOriginal) => {
    const original = await importOriginal<typeof import('@cion-suite/core')>();
    return { ...original, events, logger: { ...original.logger, child: () => log } };
});

import { startFonts, stopFonts } from '@app/fonts/start';

const platform = process.platform;
const setPlatform = (value: string) => Object.defineProperty(process, 'platform', { value, configurable: true });
const emit = (name: string, payload: object) => bus.listeners.get(name)?.forEach(handler => handler(payload as never));
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

const record = (id: string) => ({ id, type: 'git', name: id, url: 'https://github.com/o/r', branch: 'main', isPrivate: false });

beforeEach(() => {
    setPlatform('win32');
    bus.listeners.clear();
    for (const fn of [...Object.values(installer), store.list, store.get, log.warn, events.on]) fn.mockClear();
    installer.install.mockResolvedValue({ ok: 0, failed: 0, skipped: 0 });
    installer.remove.mockResolvedValue(undefined);
    installer.prune.mockResolvedValue(undefined);
    installer.all.mockResolvedValue(undefined);
    store.list.mockResolvedValue([record('a'), record('b')]);
    store.get.mockImplementation((id: string) => Promise.resolve(record(id)));
});

afterEach(() => {
    stopFonts();
    setPlatform(platform);
});

describe('startFonts', () => {
    it('не win32 - без подписок и сверки', async () => {
        setPlatform('linux');

        startFonts();
        await flush();

        expect(events.on).not.toHaveBeenCalled();
        expect(store.list).not.toHaveBeenCalled();
    });

    it('сверка: лишние источники чистятся, затем ставятся шрифты всех источников', async () => {
        startFonts();
        await flush();

        expect(installer.prune).toHaveBeenCalledWith(new Set(['a', 'b']));
        expect(installer.all).toHaveBeenCalledWith([record('a'), record('b')]);
        expect(installer.prune.mock.invocationCallOrder[0]).toBeLessThan(installer.all.mock.invocationCallOrder[0]!);
    });

    it('список источников не прочитан - ничего не удаляется и не ставится', async () => {
        store.list.mockRejectedValue(new Error('sources.json is corrupted'));

        startFonts();
        await flush();

        expect(installer.prune).not.toHaveBeenCalled();
        expect(installer.all).not.toHaveBeenCalled();
        expect(log.warn).toHaveBeenCalled();
    });

    it('source:synced - установка шрифтов источника', async () => {
        startFonts();

        emit('source:synced', { sourceId: 'a', lastSyncedAt: 1, fromCache: true });
        await flush();

        expect(installer.install).toHaveBeenCalledWith(record('a'));
    });

    it('source:synced удалённого источника - предупреждение, без падения', async () => {
        store.get.mockRejectedValue(new Error('Source not found'));
        startFonts();

        emit('source:synced', { sourceId: 'zzz', lastSyncedAt: 1, fromCache: false });
        await flush();

        expect(installer.install).not.toHaveBeenCalled();
        expect(log.warn).toHaveBeenCalled();
    });

    it('source:changed remove - удаление шрифтов; add и update игнорируются', async () => {
        startFonts();

        emit('source:changed', { sourceId: 'a', type: 'add' });
        emit('source:changed', { sourceId: 'a', type: 'update' });
        expect(installer.remove).not.toHaveBeenCalled();

        emit('source:changed', { sourceId: 'a', type: 'remove' });
        expect(installer.remove).toHaveBeenCalledWith('a');
    });

    it('сбой удаления шрифтов - предупреждение', async () => {
        installer.remove.mockRejectedValue(new Error('locked'));
        startFonts();

        emit('source:changed', { sourceId: 'a', type: 'remove' });
        await flush();

        expect(log.warn).toHaveBeenCalled();
    });
});

describe('stopFonts', () => {
    it('снимает подписки', async () => {
        startFonts();
        stopFonts();

        emit('source:synced', { sourceId: 'a', lastSyncedAt: 1, fromCache: true });
        emit('source:changed', { sourceId: 'a', type: 'remove' });
        await flush();

        expect(installer.install).not.toHaveBeenCalled();
        expect(installer.remove).not.toHaveBeenCalled();
    });
});
