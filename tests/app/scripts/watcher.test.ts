import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type WatchCallback = (type: string, filename: string | null) => void;

const fsm = vi.hoisted(() => ({ watch: vi.fn(), mkdirSync: vi.fn(), stat: vi.fn() }));
const emit = vi.hoisted(() => vi.fn());
const log = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock('node:fs', () => ({ default: { watch: fsm.watch, mkdirSync: fsm.mkdirSync } }));
vi.mock('node:fs/promises', () => ({ default: { stat: fsm.stat } }));
vi.mock('@app/utils/paths', () => ({ paths: { vault: () => 'V' } }));
vi.mock('@cion-suite/core', () => ({
    events: { emit },
    logger: { child: () => log },
}));

import { watcher } from '@app/scripts/watcher';

class Handle {
    handlers = new Map<string, (e: unknown) => void>();
    close = vi.fn();
    on(name: string, cb: (e: unknown) => void) {
        this.handlers.set(name, cb);
        return this;
    }
}

let handle: Handle;
let fire: WatchCallback;

beforeEach(() => {
    vi.useFakeTimers();
    for (const fn of [fsm.watch, fsm.mkdirSync, fsm.stat, emit, log.warn]) fn.mockReset();
    handle = new Handle();
    fsm.watch.mockImplementation((_root: string, _opts: unknown, cb: WatchCallback) => {
        fire = cb;
        return handle;
    });
    fsm.stat.mockResolvedValue({});
    watcher.start();
});

afterEach(() => {
    watcher.stop();
    vi.useRealTimers();
});

describe('watcher: фильтр путей', () => {
    it('реагирует только на <источник>/scripts/<файл>', async () => {
        for (const name of ['s\\scripts\\cfg\\a.json', 's\\lib\\x.ahk', 's\\scripts', 'a.ahk', null]) {
            fire('change', name);
        }
        await vi.advanceTimersByTimeAsync(500);

        expect(emit).not.toHaveBeenCalled();
    });

    it('игнорирует tmp атомарной записи', async () => {
        fire('rename', 's\\scripts\\a.ahk.1234.tmp');
        await vi.advanceTimersByTimeAsync(500);

        expect(emit).not.toHaveBeenCalled();
    });

    it('принимает и прямые, и обратные слэши', async () => {
        fire('change', 's/scripts/a.ahk');
        await vi.advanceTimersByTimeAsync(200);

        expect(emit).toHaveBeenCalledTimes(1);
    });
});

describe('watcher: дебаунс и тип события', () => {
    it('серия правок одного файла - одно событие через 150 мс', async () => {
        fire('change', 's\\scripts\\a.ahk');
        await vi.advanceTimersByTimeAsync(100);
        fire('change', 's\\scripts\\a.ahk');
        await vi.advanceTimersByTimeAsync(100);
        expect(emit).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(100);
        expect(emit).toHaveBeenCalledTimes(1);
        expect(emit).toHaveBeenCalledWith('script:changed', { type: 'change', filePath: expect.stringContaining('a.ahk') });
    });

    it('файла нет на диске - unlink', async () => {
        fsm.stat.mockRejectedValue(new Error('ENOENT'));
        fire('rename', 's\\scripts\\a.ahk');
        await vi.advanceTimersByTimeAsync(200);

        expect(emit).toHaveBeenCalledWith('script:changed', { type: 'unlink', filePath: expect.stringContaining('a.ahk') });
    });

    it('разные файлы дебаунсятся независимо', async () => {
        fire('change', 's\\scripts\\a.ahk');
        fire('change', 's\\scripts\\b.ahk');
        await vi.advanceTimersByTimeAsync(200);

        expect(emit).toHaveBeenCalledTimes(2);
    });
});

describe('watcher: жизненный цикл', () => {
    it('повторный start не создаёт второй watcher', () => {
        watcher.start();

        expect(fsm.watch).toHaveBeenCalledTimes(1);
    });

    it('stop гасит ожидающие таймеры и закрывает watcher', async () => {
        fire('change', 's\\scripts\\a.ahk');
        watcher.stop();
        await vi.advanceTimersByTimeAsync(500);

        expect(emit).not.toHaveBeenCalled();
        expect(handle.close).toHaveBeenCalled();
    });

    it('ошибка watcher закрывает его и позволяет запуститься снова', () => {
        handle.handlers.get('error')!(new Error('EPERM'));

        expect(log.warn).toHaveBeenCalled();
        expect(handle.close).toHaveBeenCalled();
        watcher.start();
        expect(fsm.watch).toHaveBeenCalledTimes(2);
    });
});
