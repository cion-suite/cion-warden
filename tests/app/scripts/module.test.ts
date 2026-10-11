// Модуль: сбой watcher не роняет модуль, stop гасит watcher.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const watcher = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }));
const log = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock('@app/scripts/watcher', () => ({ watcher }));
vi.mock('@cion-suite/core', async (importOriginal) => {
    const original = await importOriginal<typeof import('@cion-suite/core')>();
    return { ...original, logger: { ...original.logger, child: () => log } };
});

import { catalogModule } from '@app/catalog/module';
import { scriptsHandlers } from '@app/scripts/handlers';
import { scriptsModule } from '@app/scripts/module';

beforeEach(() => {
    watcher.start.mockReset();
    watcher.stop.mockReset();
    log.warn.mockReset();
});

describe('scriptsModule', () => {
    it('id, каналы и зависимость от catalog', () => {
        expect(scriptsModule.id).toBe('scripts');
        expect(scriptsModule.handlers).toEqual([scriptsHandlers]);
        expect(scriptsModule.needs).toEqual([catalogModule]);
    });

    it('start запускает watcher', async () => {
        await scriptsModule.start?.();

        expect(watcher.start).toHaveBeenCalledTimes(1);
        expect(log.warn).not.toHaveBeenCalled();
    });

    it('сбой watcher ловится: warn, start не бросает', async () => {
        watcher.start.mockImplementation(() => {
            throw new Error('EPERM');
        });

        await expect(Promise.resolve(scriptsModule.start?.())).resolves.toBeUndefined();
        expect(log.warn).toHaveBeenCalledTimes(1);
    });

    it('stop закрывает watcher', async () => {
        await scriptsModule.stop?.();

        expect(watcher.stop).toHaveBeenCalledTimes(1);
    });
});
