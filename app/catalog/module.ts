import { kernel } from '@cion-suite/core';
import { catalogHandlers } from '@app/catalog/handlers';
import { startCatalog } from '@app/catalog/start';
import { githubModule } from '@app/github/module';
import { sourcesModule } from '@app/sources/module';

export const catalogModule = kernel.module({
    id: 'catalog',
    needs: [sourcesModule, githubModule],
    handlers: catalogHandlers,
    start: startCatalog,
});
