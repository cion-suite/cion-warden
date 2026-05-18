import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserWindow } from 'electron';
import { createWindow } from '@cion-suite/core/window';
import { getIconPath } from '../utils/paths.js';
import { closeSplashWindow } from './splash-window.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
    return mainWindow;
}

export function focusMainWindow(): void {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
}

export async function openMainWindow(): Promise<BrowserWindow> {
    mainWindow = await createWindow({
        width: 1100,
        height: 520,
        minWidth: 800,
        minHeight: 500,
        icon: getIconPath(),
        preload: join(__dirname, '../preload/index.js'),
        url: process.env.ELECTRON_RENDERER_URL,
        filePath: process.env.ELECTRON_RENDERER_URL
            ? undefined
            : join(__dirname, '../renderer/index.html'),
        onReady: () => closeSplashWindow(),
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    return mainWindow;
}
