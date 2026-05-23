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
        width: 900,
        height: 450,
        minWidth: 800,
        minHeight: 400,
        icon: getIconPath(),
        preload: join(__dirname, '../preload/index.js'),
        url: process.env.ELECTRON_RENDERER_URL,
        filePath: process.env.ELECTRON_RENDERER_URL
            ? undefined
            : join(__dirname, '../renderer/index.html'),
        onReady: () => closeSplashWindow(),
    });

    // XButton1/XButton2 trigger Chromium's browser-backward/forward which pops
    // React Router history and unmounts open dialogs. SPA has no history nav use
    // case — suppress globally so XButton can be bound as a hotkey safely.
    mainWindow.on('app-command', (e, cmd) => {
        if (cmd === 'browser-backward' || cmd === 'browser-forward') e.preventDefault();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    return mainWindow;
}
