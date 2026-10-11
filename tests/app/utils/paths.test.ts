import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const electron = vi.hoisted(() => ({
    app: { isPackaged: false, getAppPath: (): string => '', getPath: (name: string): string => `C:/Users/u/${name}` },
}));

vi.mock('electron', () => electron);

import { paths } from '@app/utils/paths';

// __dirname - реальная папка модуля, path.join не подменяем
const moduleDir = path.resolve(__dirname, '../../../app/utils');
const rendererIndex = path.join(moduleDir, '../renderer/index.html');

const savedDevUrl = process.env.ELECTRON_RENDERER_URL;
const savedResources = Object.getOwnPropertyDescriptor(process, 'resourcesPath');
const savedPlatform = Object.getOwnPropertyDescriptor(process, 'platform');

function setPlatform(platform: NodeJS.Platform): void {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
}

beforeEach(() => {
    electron.app.isPackaged = false;
    electron.app.getAppPath = () => 'C:\\Program Files\\App\\resources\\app.asar';
    delete process.env.ELECTRON_RENDERER_URL;
    setPlatform('win32');
    Object.defineProperty(process, 'resourcesPath', {
        value: 'C:\\Users\\Иван Петров\\resources',
        configurable: true,
    });
});

afterEach(() => {
    if (savedDevUrl === undefined) delete process.env.ELECTRON_RENDERER_URL;
    else process.env.ELECTRON_RENDERER_URL = savedDevUrl;
    if (savedResources) Object.defineProperty(process, 'resourcesPath', savedResources);
    else delete (process as { resourcesPath?: string }).resourcesPath;
    if (savedPlatform) Object.defineProperty(process, 'platform', savedPlatform);
});

describe('paths.page', () => {
    it('упакованная сборка: file-URL на renderer/index.html без обратных слэшей', () => {
        electron.app.isPackaged = true;
        const url = paths.page();

        expect(url.startsWith('file:///')).toBe(true);
        expect(url.endsWith('/renderer/index.html')).toBe(true);
        expect(url).not.toContain('\\');
    });

    it('URL кодирует путь: обратное преобразование даёт исходный файл', () => {
        electron.app.isPackaged = true;

        expect(fileURLToPath(paths.page())).toBe(path.normalize(rendererIndex));
    });

    it('пробел и кириллица в папке кодируются процентами', async () => {
        // Копия модуля в папке с пробелом и кириллицей; внутри
        // проекта (build/): иначе мок electron её не видит
        const buildDir = path.resolve(moduleDir, '../../build');
        fs.mkdirSync(buildDir, { recursive: true });
        const root = fs.mkdtempSync(path.join(buildDir, 'Мой каталог '));
        try {
            const dir = path.join(root, 'out', 'main');
            fs.mkdirSync(dir, { recursive: true });
            const copy = path.join(dir, 'paths.ts');
            fs.copyFileSync(path.join(moduleDir, 'paths.ts'), copy);
            electron.app.isPackaged = true;

            const { paths: pathsFromCopy } = await import(/* @vite-ignore */ pathToFileURL(copy).href);
            const url: string = pathsFromCopy.page('x');

            expect(url).toContain('%D0%9C%D0%BE%D0%B9%20%D0%BA%D0%B0%D1%82%D0%B0%D0%BB%D0%BE%D0%B3%20');
            expect(url.endsWith('/out/renderer/index.html#/x')).toBe(true);
            expect(fileURLToPath(url.split('#')[0])).toBe(path.join(root, 'out', 'renderer', 'index.html'));
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('route превращается в #/route после пути к файлу', () => {
        electron.app.isPackaged = true;

        expect(paths.page('settings').endsWith('/renderer/index.html#/settings')).toBe(true);
    });

    it('без route URL без #', () => {
        electron.app.isPackaged = true;

        expect(paths.page().includes('#')).toBe(false);
    });

    it('dev-сервер: ELECTRON_RENDERER_URL + #/route, файл не трогается', () => {
        process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173';

        expect(paths.page()).toBe('http://localhost:5173');
        expect(paths.page('about')).toBe('http://localhost:5173#/about');
    });

    it('упакованная сборка игнорирует ELECTRON_RENDERER_URL', () => {
        electron.app.isPackaged = true;
        process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173';

        expect(paths.page().startsWith('file:///')).toBe(true);
    });

    it('не упакована и без dev-сервера: file-URL', () => {
        expect(paths.page().startsWith('file:///')).toBe(true);
    });
});

describe('остальные пути', () => {
    it('splash: упакованная - resourcesPath, иначе app/splash.html', () => {
        electron.app.isPackaged = true;
        expect(paths.splash()).toBe(path.join('C:\\Users\\Иван Петров\\resources', 'splash.html'));

        electron.app.isPackaged = false;
        expect(paths.splash()).toBe(
            path.join('C:\\Program Files\\App\\resources\\app.asar', 'app/splash.html'),
        );
    });

    it('changelog: упакованная - resources/versions, иначе docs/versions', () => {
        electron.app.isPackaged = true;
        expect(paths.changelog('beta.md')).toBe(
            path.join('C:\\Users\\Иван Петров\\resources', 'versions', 'beta.md'),
        );

        electron.app.isPackaged = false;
        expect(paths.changelog('release.md')).toBe(
            path.join('C:\\Program Files\\App\\resources\\app.asar', 'docs/versions', 'release.md'),
        );
    });

    it('preload: preload/index.js рядом с папкой main', () => {
        expect(paths.preload()).toBe(path.join(moduleDir, '../preload/index.js'));
    });

    it('icon: имя зависит от упаковки, место - тоже', () => {
        electron.app.isPackaged = true;
        expect(paths.icon()).toBe(path.join(moduleDir, '../renderer/assets/icon.ico'));

        electron.app.isPackaged = false;
        expect(paths.icon()).toBe(
            path.join('C:\\Program Files\\App\\resources\\app.asar', 'public/assets/icon_dev.ico'),
        );
    });

    it('icon: на linux png в любой сборке', () => {
        setPlatform('linux');

        electron.app.isPackaged = true;
        expect(paths.icon()).toBe(path.join(moduleDir, '../renderer/assets/icon.png'));

        electron.app.isPackaged = false;
        expect(path.basename(paths.icon())).toBe('icon.png');
    });
});

describe('paths: данные приложения', () => {
    const root = path.join('C:/Users/u/appData', '@cion-suite', 'warden');

    it('userData - папка старого приложения, а не по app.getName()', () => {
        expect(paths.userData()).toBe(root);
    });

    it('файлы лежат в userData под прежними именами', () => {
        expect(paths.sources()).toBe(path.join(root, 'sources.json'));
        expect(paths.fonts.index()).toBe(path.join(root, 'installed-fonts.json'));
        expect(paths.vault()).toBe(path.join(root, 'global_vault'));
    });

    it('source(id) - каталоги источника в global_vault', () => {
        const base = path.join(root, 'global_vault', 'abc');

        expect(paths.source('abc')).toEqual({
            base,
            scripts: path.join(base, 'scripts'),
            cfg: path.join(base, 'scripts', 'cfg'),
            lib: path.join(base, 'lib'),
            presets: path.join(base, 'presets'),
            manifest: path.join(base, '.manifest.json'),
            cache: path.join(base, '.local-cache.json'),
        });
    });

    it('fonts.dir - пользовательские шрифты Windows', () => {
        const saved = process.env.LOCALAPPDATA;
        process.env.LOCALAPPDATA = 'C:/Users/u/Local';

        expect(paths.fonts.dir()).toBe(path.join('C:/Users/u/Local', 'Microsoft', 'Windows', 'Fonts'));

        if (saved === undefined) delete process.env.LOCALAPPDATA;
        else process.env.LOCALAPPDATA = saved;
    });
});
