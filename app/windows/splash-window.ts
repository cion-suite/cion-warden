import { app } from 'electron';
import { createSplashWindow, type SplashWindowController } from '@cion-suite/core/window';
import { getIconFileUrl, getIconPath, getSplashPath } from '../utils/paths.js';

let splash: SplashWindowController | null = null;

export async function openSplashWindow(): Promise<SplashWindowController> {
    splash = await createSplashWindow({
        width: 300,
        height: 350,
        icon: getIconPath(),
        filePath: getSplashPath(),
    });

    await splash.window.webContents.executeJavaScript(
        `window.splashAPI?.setVersion(${JSON.stringify(app.getVersion())});` +
        `window.splashAPI?.setLogo(${JSON.stringify(getIconFileUrl())});`,
    );

    return splash;
}

export function updateSplash(progress: number, status: string): void {
    const win = splash?.window;
    if (!win || win.isDestroyed()) return;
    void win.webContents.executeJavaScript(
        `window.splashAPI?.setProgress(${progress});` +
        `window.splashAPI?.setStatus(${JSON.stringify(status)});`,
    );
}

export function closeSplashWindow(): void {
    splash?.close();
    splash = null;
}
