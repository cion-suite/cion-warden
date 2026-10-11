import { kernel } from '@cion-suite/core';
import { sourcesHandlers } from '@app/sources/handlers';
import { store } from '@app/sources/store';

export const sourcesModule = kernel.module({
    id: 'sources',
    handlers: sourcesHandlers,
    start: store.seed,
});
