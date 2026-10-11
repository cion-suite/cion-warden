// Модуль: каналы sources, start сеет источник по умолчанию.
import { describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ seed: vi.fn() }));

vi.mock('@app/sources/store', () => ({ store }));

import { sourcesHandlers } from '@app/sources/handlers';
import { sourcesModule } from '@app/sources/module';

describe('sourcesModule', () => {
    it('id и каналы - из handlers', () => {
        expect(sourcesModule.id).toBe('sources');
        expect(sourcesModule.handlers).toEqual([sourcesHandlers]);
    });

    it('start сеет источник по умолчанию', async () => {
        await sourcesModule.start?.();

        expect(store.seed).toHaveBeenCalledTimes(1);
    });
});
