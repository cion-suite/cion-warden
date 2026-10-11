import { kernel, logger } from '@cion-suite/core';
import { catalogModule } from '@app/catalog/module';
import { scriptsHandlers } from '@app/scripts/handlers';
import { watcher } from '@app/scripts/watcher';

const log = logger.child('Scripts');

export const scriptsModule = kernel.module({
    id: 'scripts',
    needs: [catalogModule],
    handlers: scriptsHandlers,
    // Без watcher каналы работают, но список не обновляется сам:
    // сбой не должен переводить модуль в failed
    start: () => {
        try {
            watcher.start();
        } catch (e) {
            log.warn('Script watcher did not start', e);
        }
    },
    stop: watcher.stop,
});
