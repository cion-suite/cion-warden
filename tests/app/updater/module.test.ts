// Модуль только связывает каналы и жизненный цикл updater.
import { describe, expect, it, vi } from 'vitest';

const updater = vi.hoisted(() => ({
    updaterHandlers: { 'updater:refresh': vi.fn(), 'updater:install': vi.fn(), 'updater:changelog:get': vi.fn() },
    startUpdater: vi.fn(),
    stopUpdater: vi.fn(),
}));

vi.mock('@app/updater/updater', () => updater);

import { githubModule } from '@app/github/module';
import { sourcesModule } from '@app/sources/module';
import { updaterModule } from '@app/updater/module';

describe('updaterModule', () => {
    it('id и каналы - из updater.ts, зависит от sources и github', () => {
        expect(updaterModule.id).toBe('updater');
        expect(updaterModule.handlers).toEqual([updater.updaterHandlers]);
        expect(updaterModule.needs).toEqual([sourcesModule, githubModule]);
    });

    it('start и stop - запуск и остановка updater', async () => {
        await updaterModule.start?.();
        await updaterModule.stop?.();

        expect(updater.startUpdater).toHaveBeenCalledTimes(1);
        expect(updater.stopUpdater).toHaveBeenCalledTimes(1);
    });
});
