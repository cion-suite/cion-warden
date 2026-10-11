import { kernel } from '@cion-suite/core';
import { githubHandlers } from '@app/github/handlers';
import { sourcesModule } from '@app/sources/module';

export const githubModule = kernel.module({
    id: 'github',
    needs: [sourcesModule],
    handlers: githubHandlers,
});
