import { kernel } from '@cion-suite/core';
import { startUpdater, stopUpdater, updaterHandlers } from '@app/updater/updater';

export const updaterModule = kernel.module({
    id: 'updater',
    handlers: updaterHandlers,
    start: startUpdater,
    stop: stopUpdater,
});
