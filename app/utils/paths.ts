import { app } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// In dev mode electron-vite emits main to build/out/main/, so __dirname points
// there, not to source. Packaged builds need __dirname for renderer assets;
// dev builds resolve from app.getAppPath() (project root).
const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveBundledResource(relFromAppPath: string, packagedRel: string): string {
    return app.isPackaged ? join(__dirname, packagedRel) : join(app.getAppPath(), relFromAppPath);
}

function resolveAsset(filename: string): string {
    return resolveBundledResource(
        `public/assets/${filename}`,
        `../renderer/assets/${filename}`
    );
}

export function getIconPath(): string {
    if (process.platform === 'linux') return resolveAsset('icon.png');
    return resolveAsset(app.isPackaged ? 'icon.ico' : 'icon_dev.ico');
}

export function getIconFileUrl(): string {
    return pathToFileURL(getIconPath()).href;
}

export function getSplashPath(): string {
    return app.isPackaged
        ? join(process.resourcesPath, 'splash.html')
        : join(app.getAppPath(), 'app/splash.html');
}
