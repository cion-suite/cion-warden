import { kernel } from '@cion-suite/core';
import { githubModule } from '@app/github/module';
import { sourcesModule } from '@app/sources/module';
import { startUpdater, stopUpdater, updaterHandlers } from '@app/updater/updater';

export const updaterModule = kernel.module({
    id: 'updater',
    needs: [sourcesModule, githubModule],
    handlers: updaterHandlers,
    start: startUpdater,
    stop: stopUpdater,
});
