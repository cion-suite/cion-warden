import { beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
    app: { getVersion: vi.fn(() => '3.0.0') },
    nativeTheme: { themeSource: 'system' },
}));
const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
const core = vi.hoisted(() => ({ create: vi.fn(), focus: vi.fn(), splash: vi.fn() }));

vi.mock('electron', () => electron);
vi.mock('@app/utils/paths', () => ({
    paths: {
        splash: () => '/splash.html',
        preload: () => '/preload.js',
        page: (route = '') => `app://renderer/${route ? `#/${route}` : ''}`,
        icon: () => '/icon.png',
    },
}));
vi.mock('@cion-suite/core', async (importOriginal) => {
    const original = await importOriginal<typeof import('@cion-suite/core')>();
    return {
        ...original,
        logger: { ...original.logger, child: () => log },
        windows: { ...original.windows, create: core.create, focus: core.focus, splash: core.splash },
    };
});

// lib ES2022: Promise.withResolvers недоступен
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

function fakeWindow() {
    return { on: vi.fn() };
}

function fakeSplash() {
    return { update: vi.fn(async () => undefined), close: vi.fn() };
}

let splash: ReturnType<typeof fakeSplash>;

beforeEach(() => {
    vi.resetModules();
    log.error.mockClear();
    core.focus.mockClear();
    electron.nativeTheme.themeSource = 'system';
    splash = fakeSplash();
    core.create.mockReset().mockResolvedValue(fakeWindow());
    core.splash.mockReset().mockResolvedValue(splash);
});

async function load() {
    return (await import('@app/shell/index')).shell;
}

describe('shell.main.open', () => {
    it('создаёт окно с show: content, ждёт splash и закрывает его после resolve create', async () => {
        const opened = deferred<ReturnType<typeof fakeSplash>>();
        const created = deferred<ReturnType<typeof fakeWindow>>();
        core.splash.mockReturnValue(opened.promise);
        core.create.mockReturnValue(created.promise);
        const shell = await load();
        void shell.splash.open();

        const opening = shell.main.open();
        await Promise.resolve();
        expect(core.create).not.toHaveBeenCalled();

        opened.resolve(splash);
        await vi.waitFor(() =>
            expect(core.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    key: 'main',
                    show: 'content',
                    persist: 'main',
                    width: 900,
                    height: 450,
                    minWidth: 800,
                    minHeight: 400,
                    url: 'app://renderer/',
                    preload: '/preload.js',
                }),
            ),
        );
        expect(splash.update).toHaveBeenCalledWith({ progress: 90, status: 'Loading interface' });
        expect(splash.close).not.toHaveBeenCalled();

        created.resolve(fakeWindow());
        await opening;

        expect(splash.close).toHaveBeenCalledTimes(1);
    });

    it('сбой windows.create - отказ, splash не закрыт', async () => {
        const shell = await load();
        core.create.mockRejectedValue(new Error('окно не создалось'));

        await expect(shell.main.open()).rejects.toThrow('окно не создалось');

        expect(splash.close).not.toHaveBeenCalled();
    });

    it('сбой splash: log.error, окно всё равно открывается', async () => {
        core.splash.mockRejectedValue(new Error('splash упал'));
        const shell = await load();

        await expect(shell.main.open()).resolves.toBeUndefined();

        expect(log.error).toHaveBeenCalledTimes(1);
        expect(core.create).toHaveBeenCalledTimes(1);
        expect(splash.close).not.toHaveBeenCalled();
    });

    it('жесты назад/вперёд мыши отменяются, прочие app-command - нет', async () => {
        const win = fakeWindow();
        core.create.mockResolvedValue(win);
        const shell = await load();

        await shell.main.open();

        expect(win.on).toHaveBeenCalledWith('app-command', expect.any(Function));
        const handler = win.on.mock.calls[0][1] as (event: { preventDefault(): void }, command: string) => void;
        for (const command of ['browser-backward', 'browser-forward', 'browser-home']) {
            const event = { preventDefault: vi.fn() };
            handler(event, command);
            expect(event.preventDefault).toHaveBeenCalledTimes(command === 'browser-home' ? 0 : 1);
        }
    });

    it('окно создаётся без backgroundColor: фон даёт ядро по теме', async () => {
        const shell = await load();

        await shell.main.open();

        expect(core.create.mock.calls[0][0]).not.toHaveProperty('backgroundColor');
    });
});

describe('shell.splash.open', () => {
    it('два вызова - один windows.splash и один промис', async () => {
        const shell = await load();

        const first = shell.splash.open();
        const second = shell.splash.open();
        await Promise.all([first, second]);

        expect(first).toBe(second);
        expect(core.splash).toHaveBeenCalledTimes(1);
        expect(core.splash).toHaveBeenCalledWith(
            expect.objectContaining({
                version: '3.0.0',
                filePath: '/splash.html',
                backgroundColor: '#09090b',
                status: 'Starting',
                progress: 0,
            }),
        );
        expect(core.splash.mock.calls[0][0]).not.toHaveProperty('logo');
        expect(splash.update).not.toHaveBeenCalled();
    });

    it('сбой не фатален: промис резолвится, ошибка в log', async () => {
        core.splash.mockRejectedValue(new Error('splash упал'));
        const shell = await load();

        await expect(shell.splash.open()).resolves.toBeUndefined();

        expect(log.error).toHaveBeenCalledWith('Splash failed to open', expect.any(Error));
    });
});

describe('shell.splash.update / close', () => {
    it('до открытия splash - no-op, не бросает', async () => {
        const shell = await load();

        expect(() => shell.splash.update({ progress: 50, status: 'Registering handlers' })).not.toThrow();
        expect(() => shell.splash.close()).not.toThrow();
    });

    it('после открытия передаёт состояние и закрывает окно', async () => {
        const shell = await load();
        await shell.splash.open();

        shell.splash.update({ progress: 70, status: 'Configuring updater' });
        shell.splash.close();

        expect(splash.update).toHaveBeenCalledWith({ progress: 70, status: 'Configuring updater' });
        expect(splash.close).toHaveBeenCalledTimes(1);
    });
});

describe('shell.main.shown', () => {
    it('резолвится после показа главного окна', async () => {
        const created = deferred<ReturnType<typeof fakeWindow>>();
        core.create.mockReturnValue(created.promise);
        const shell = await load();
        let shown = false;
        void shell.main.shown().then(() => {
            shown = true;
        });

        const opening = shell.main.open();
        await Promise.resolve();
        expect(shown).toBe(false);

        created.resolve(fakeWindow());
        await opening;
        await shell.main.shown();

        expect(shown).toBe(true);
    });
});

describe('shell.theme', () => {
    it('set переносит тему приложения в nativeTheme.themeSource', async () => {
        const shell = await load();

        shell.theme.set('dark');
        expect(electron.nativeTheme.themeSource).toBe('dark');

        shell.theme.set('system');
        expect(electron.nativeTheme.themeSource).toBe('system');
    });
});

describe('shell.main.focus', () => {
    it('зовёт windows.focus с ключом main, до открытия тоже', async () => {
        const shell = await load();

        expect(() => shell.main.focus()).not.toThrow();

        expect(core.focus).toHaveBeenCalledTimes(1);
        expect(core.focus).toHaveBeenCalledWith('main');
    });
});
