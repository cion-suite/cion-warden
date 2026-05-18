import { app, dialog } from 'electron';
import { installIpcLogger } from '@cion-suite/core/ipc';
import { requestSingleInstance } from '@cion-suite/core/window';
import { APP_ID, FEED_URLS } from './config.js';
import { bootServices } from './services/boot.js';
import { createAutoUpdater } from './services/updater.js';
import { openMainWindow, focusMainWindow } from './windows/main-window.js';
import { openSplashWindow, updateSplash, closeSplashWindow } from './windows/splash-window.js';
import { registerSystemHandlers } from './handlers/system.js';
import type { AppServices } from './types/services.js';
import type { AutoUpdaterController } from './types/updater.js';

app.setAppUserModelId(app.isPackaged ? APP_ID : `${APP_ID}.dev`);

let processLogger: Pick<AppServices['logger'], 'error'> = {
    error: (...args: unknown[]) => console.error(...args),
};
let updater: AutoUpdaterController | null = null;
let installingUpdate = false;

process.on('uncaughtException', (error) => {
    processLogger.error('uncaughtException', error);
    app.exit(1);
});
process.on('unhandledRejection', (reason) => processLogger.error('unhandledRejection', reason));

async function bootstrap(): Promise<void> {
    const { isPrimary } = requestSingleInstance({
        onSecondInstance: () => focusMainWindow(),
    });
    if (!isPrimary) return;

    await app.whenReady();

    try {
        const services = bootServices();
        processLogger = services.logger;

        await openSplashWindow();

        installIpcLogger({ logger: services.logger });

        updateSplash(50, 'Registering handlers');
        registerSystemHandlers(services);

        updateSplash(70, 'Configuring updater');
        updater = createAutoUpdater({
            appId: APP_ID,
            logger: services.logger,
            feed: FEED_URLS,
        });

        updateSplash(90, 'Loading interface');
        await openMainWindow();
        services.logger.info('main window opened');
    } catch (error) {
        closeSplashWindow();
        dialog.showErrorBox('Fatal startup error', String(error));
        app.exit(1);
    }
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', (event) => {
    if (installingUpdate) return;
    if (!updater?.isUpdateDownloaded()) return;
    installingUpdate = true;
    event.preventDefault();
    updater.installPendingUpdate();
});

app.on('will-quit', () => {
    updater?.dispose();
});

void bootstrap();
