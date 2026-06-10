import { app, dialog } from 'electron';
import { ipc } from '@cion-suite/core/ipc';
import { requestSingleInstance } from '@cion-suite/core/window';
import { APP_ID } from './config.js';
import { bootServices } from './services/boot.js';
import { createAutoUpdater } from './services/updater.js';
import { openMainWindow, focusMainWindow } from './windows/main-window.js';
import { openSplashWindow, updateSplash, closeSplashWindow } from './windows/splash-window.js';
import { registerSystemHandlers } from './handlers/system.js';
import { registerScriptHandlers } from './handlers/scripts.js';
import { registerSourceHandlers } from './handlers/sources.js';
import { registerGetScriptHandlers } from './handlers/get-scripts.js';
import { registerLibHandlers } from './handlers/libs.js';
import { registerBindHandlers } from './handlers/binds.js';
import { registerVaultHandlers } from './handlers/vault.js';
import { registerGithubHandlers } from './handlers/github.js';
import { registerFontHandlers } from './handlers/fonts.js';
import { getGlobalVaultPath, ensureGlobalVault } from './services/vault-paths.js';
import { ensureDefaultSourceSeeded } from './services/sources-store.js';
import { createScriptWatcher, type ScriptWatcher } from './services/script-watcher.js';
import { installAllSourcesFonts } from './services/font-install.js';
import type { AppServices } from './types/services.js';
import type { AutoUpdaterController } from './types/updater.js';

app.setAppUserModelId(app.isPackaged ? APP_ID : `${APP_ID}.dev`);

let processLogger: Pick<AppServices['logger'], 'error'> = {
    error: (...args: unknown[]) => console.error(...args),
};
let updater: AutoUpdaterController | null = null;
let scriptWatcher: ScriptWatcher | null = null;
let installingUpdate = false;

process.on('uncaughtException', (error) => {
    processLogger.error('uncaughtException', error);
    app.exit(1);
});
process.on('unhandledRejection', (reason) => processLogger.error('unhandledRejection', reason));

async function bootstrap(): Promise<void> {
    const isPrimary = requestSingleInstance({
        onSecondInstance: () => focusMainWindow(),
    });
    if (!isPrimary) return;

    await app.whenReady();

    try {
        const services = bootServices();
        processLogger = services.logger;

        await openSplashWindow();

        ipc.installLogger({ logger: services.logger });

        updateSplash(50, 'Registering handlers');
        registerSystemHandlers(services);
        const globalVaultPath = getGlobalVaultPath();
        await ensureGlobalVault();
        await ensureDefaultSourceSeeded(services.logger);
        registerScriptHandlers(services, globalVaultPath);
        registerSourceHandlers(services);
        registerGetScriptHandlers(services);
        registerLibHandlers(services);
        registerBindHandlers(services);
        registerVaultHandlers(services);
        registerGithubHandlers(services);
        registerFontHandlers(services, globalVaultPath);
        scriptWatcher = createScriptWatcher();
        scriptWatcher.start(globalVaultPath);

        // Startup: verify installed fonts against persisted manifests, install
        // any missing ones. Backgrounded so it doesn't block window opening.
        void installAllSourcesFonts({
            vaultBase: globalVaultPath,
            tokens: services.sourceTokens,
            logger: services.logger,
        }).catch((err) => services.logger.warn('startup font install failed', { err }));

        updateSplash(70, 'Configuring updater');
        updater = createAutoUpdater({
            logger: services.logger,
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
    scriptWatcher?.stop();
});

void bootstrap();
