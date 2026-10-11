// __dirname = build/out/main/, статика - через getAppPath().
// Шим __dirname в конце бандла: paths.* лишь из функций (TDZ)
import { app } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const resource = (packaged: string, dev: string): string => (app.isPackaged ? packaged : dev);

// Папка старого приложения (name из package.json): сменишь -
// sources.json, vault и сторы vault / settings осиротеют.
const userData = (): string => path.join(app.getPath('appData'), '@cion-suite', 'warden');

export const paths = {
    userData,
    sources: () => path.join(userData(), 'sources.json'),
    // global_vault/<sourceId>/{scripts,lib,presets}
    vault: () => path.join(userData(), 'global_vault'),
    source: (sourceId: string) => {
        const base = path.join(userData(), 'global_vault', sourceId);
        const scripts = path.join(base, 'scripts');
        return {
            base,
            scripts,
            cfg: path.join(scripts, 'cfg'),
            lib: path.join(base, 'lib'),
            presets: path.join(base, 'presets'),
            manifest: path.join(base, '.manifest.json'),
            versions: path.join(base, '.versions.json'),
        };
    },
    fonts: {
        index: () => path.join(userData(), 'installed-fonts.json'),
        // Только win32: LOCALAPPDATA есть везде, где шрифты ставим
        dir: () => path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'Windows', 'Fonts'),
    },
    splash: () => resource(
        path.join(process.resourcesPath, 'splash.html'),
        path.join(app.getAppPath(), 'app/splash.html'),
    ),
    preload: () => path.join(__dirname, '../preload/index.js'),
    icon: () => {
        const name = process.platform === 'linux'
            ? 'icon.png'
            : app.isPackaged ? 'icon.ico' : 'icon_dev.ico';
        return resource(
            path.join(__dirname, `../renderer/assets/${name}`),
            path.join(app.getAppPath(), `public/assets/${name}`),
        );
    },
    // Лог канала: docs/versions, в пакете resources/versions
    changelog: (file: string) => resource(
        path.join(process.resourcesPath, 'versions', file),
        path.join(app.getAppPath(), 'docs/versions', file),
    ),
    page: (route = '') => {
        const hash = route ? `#/${route}` : '';
        const devUrl = process.env.ELECTRON_RENDERER_URL;
        if (!app.isPackaged && devUrl) return `${devUrl}${hash}`;
        return `${pathToFileURL(path.join(__dirname, '../renderer/index.html')).href}${hash}`;
    },
};
