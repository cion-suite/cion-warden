// Модуль связывает каналы catalog, предков и start.
import { describe, expect, it, vi } from 'vitest';

const start = vi.hoisted(() => ({ startCatalog: vi.fn() }));

vi.mock('@app/catalog/start', () => start);

import { catalogHandlers } from '@app/catalog/handlers';
import { catalogModule } from '@app/catalog/module';
import { githubModule } from '@app/github/module';
import { sourcesModule } from '@app/sources/module';

describe('catalogModule', () => {
    it('id, каналы и зависимости', () => {
        expect(catalogModule.id).toBe('catalog');
        expect(catalogModule.handlers).toEqual([catalogHandlers]);
        expect(catalogModule.needs).toEqual([sourcesModule, githubModule]);
    });

    it('start - startCatalog', async () => {
        await catalogModule.start?.();

        expect(start.startCatalog).toHaveBeenCalledTimes(1);
    });
});
