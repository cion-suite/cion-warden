import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
    app: { isPackaged: true, getVersion: (): string => '1.0.0' },
}));
const autoUpdater = vi.hoisted(() => ({
    on: vi.fn(),
    setFeedURL: vi.fn(),
    checkForUpdates: vi.fn(),
    quitAndInstall: vi.fn(),
    logger: null as unknown,
}));
const events = vi.hoisted(() => ({ emit: vi.fn() }));
const shellMock = vi.hoisted(() => ({ main: { shown: vi.fn() }, splash: { update: vi.fn() } }));
const fsMock = vi.hoisted(() => ({ readFile: vi.fn() }));
const pathsMock = vi.hoisted(() => ({ changelog: vi.fn((file: string) => `/versions/${file}`) }));
const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
const githubMock = vi.hoisted(() => ({ release: vi.fn() }));
const sourcesStore = vi.hoisted(() => ({ list: vi.fn() }));
const sourceTokens = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('electron', () => electron);
vi.mock('node:fs/promises', () => fsMock);
vi.mock('@app/utils/paths', () => ({ paths: pathsMock }));
vi.mock('electron-updater', () => ({ default: { autoUpdater } }));
vi.mock('@app/shell', () => ({ shell: shellMock }));
vi.mock('@app/github', () => ({ github: githubMock }));
vi.mock('@app/sources/store', () => ({ store: sourcesStore }));
vi.mock('@app/sources/tokens', () => ({ tokens: sourceTokens }));
vi.mock('@cion-suite/core', async (importOriginal) => {
    const original = await importOriginal<typeof import('@cion-suite/core')>();
    return {
        ...original,
        events,
        logger: { ...original.logger, child: () => log },
    };
});
vi.mock('@shared/config', () => ({
    CONFIG: {
        releases: [
            { owner: 'Lazy-World', repo: 'wf-macro' },
            { owner: 'cion-suite', repo: 'cion-warden', private: true },
        ],
    },
}));

const FIRST_CHECK_MS = 3_000;
const HOUR_MS = 60 * 60 * 1000;

let showMain: () => void;

beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    electron.app.isPackaged = true;
    electron.app.getVersion = () => '1.0.0';
    fsMock.readFile.mockReset();
    pathsMock.changelog.mockClear();
    githubMock.release.mockReset().mockResolvedValue('v1.0.1');
    sourcesStore.list.mockReset().mockResolvedValue([{ id: 's1', url: 'https://github.com/cion-suite/macros' }]);
    sourceTokens.get.mockReset().mockResolvedValue('tok-1');
    autoUpdater.on.mockReset();
    autoUpdater.setFeedURL.mockReset();
    autoUpdater.checkForUpdates.mockReset().mockResolvedValue(null);
    autoUpdater.quitAndInstall.mockReset();
    autoUpdater.logger = null;
    events.emit.mockReset();
    log.info.mockReset();
    log.error.mockReset();
    log.warn.mockReset();
    shellMock.splash.update.mockReset();
    shellMock.main.shown.mockReset().mockReturnValue(
        new Promise<void>((resolve) => {
            showMain = resolve;
        }),
    );
});

afterEach(() => {
    vi.useRealTimers();
});

async function load() {
    return import('@app/updater/updater');
}

describe('расписание проверок', () => {
    it('до показа главного окна проверки нет, после - через 3 с и раз в час', async () => {
        const { startUpdater } = await load();
        startUpdater();

        await vi.advanceTimersByTimeAsync(FIRST_CHECK_MS * 10);
        expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();

        showMain();
        await vi.advanceTimersByTimeAsync(FIRST_CHECK_MS - 1);
        expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);
        expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(HOUR_MS);
        expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);
    });

    it('start показывает статус на splash', async () => {
        const { startUpdater } = await load();
        startUpdater();

        expect(shellMock.splash.update).toHaveBeenCalledWith({ progress: 70, status: 'Configuring updater' });
    });

    it('слушатели и логгер ставятся в start, фид - при проверке', async () => {
        const { startUpdater } = await load();
        startUpdater();

        expect(autoUpdater.logger).toBe(log);
        expect(autoUpdater.on).toHaveBeenCalledWith('update-downloaded', expect.any(Function));
        expect(autoUpdater.setFeedURL).not.toHaveBeenCalled();

        showMain();
        await vi.advanceTimersByTimeAsync(FIRST_CHECK_MS);

        expect(autoUpdater.setFeedURL).toHaveBeenCalledTimes(1);
        expect(autoUpdater.setFeedURL).toHaveBeenCalledWith({ provider: 'github', owner: 'Lazy-World', repo: 'wf-macro' });
    });

    it('сбой проверки пишется в лог и не рвёт расписание', async () => {
        autoUpdater.checkForUpdates.mockRejectedValueOnce(new Error('сеть'));
        const { startUpdater } = await load();
        startUpdater();
        showMain();

        await vi.advanceTimersByTimeAsync(FIRST_CHECK_MS);
        expect(log.error).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(HOUR_MS);
        expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);
    });

    it('в dev-сборке проверка пропускается', async () => {
        electron.app.isPackaged = false;
        const { startUpdater } = await load();
        startUpdater();
        showMain();

        await vi.advanceTimersByTimeAsync(FIRST_CHECK_MS);

        expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
        expect(githubMock.release).not.toHaveBeenCalled();
    });
});

describe('выбор репозитория релизов', () => {
    type Tag = string | Error;

    function latest(macro: Tag, warden: Tag) {
        githubMock.release.mockImplementation(async (ref: { repo: string }) => {
            const tag = ref.repo === 'wf-macro' ? macro : warden;
            if (tag instanceof Error) throw tag;
            return tag;
        });
    }

    async function check() {
        const { startUpdater } = await load();
        startUpdater();
        showMain();
        await vi.advanceTimersByTimeAsync(FIRST_CHECK_MS);
    }

    const MACRO_FEED = { provider: 'github', owner: 'Lazy-World', repo: 'wf-macro' };
    const WARDEN_FEED = { provider: 'github', owner: 'cion-suite', repo: 'cion-warden', private: true, token: 'tok-1' };

    it('берёт репозиторий с самой новой версией: приватный - с токеном', async () => {
        latest('v1.2.0', 'v1.3.0');

        await check();

        expect(githubMock.release).toHaveBeenCalledWith({ owner: 'Lazy-World', repo: 'wf-macro' }, null);
        expect(autoUpdater.setFeedURL).toHaveBeenCalledWith(WARDEN_FEED);
        expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    });

    it('wf-macro новее: открытый фид без токена', async () => {
        latest('v1.4.0', 'v1.3.0');

        await check();

        expect(autoUpdater.setFeedURL).toHaveBeenCalledWith(MACRO_FEED);
    });

    it('равные версии - первый в CONFIG (wf-macro)', async () => {
        latest('v1.2.0', 'v1.2.0');

        await check();

        expect(autoUpdater.setFeedURL).toHaveBeenCalledWith(MACRO_FEED);
    });

    it('победитель не новее установленной: checked без проверки', async () => {
        latest('v0.1.1', 'v1.0.0');

        await check();

        expect(events.emit).toHaveBeenCalledWith('updater:checked');
        expect(autoUpdater.setFeedURL).not.toHaveBeenCalled();
        expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    });

    it('тег не semver - репозиторий пропускается', async () => {
        latest('nightly', 'v1.1.0');

        await check();

        expect(autoUpdater.setFeedURL).toHaveBeenCalledWith(WARDEN_FEED);
        expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('Lazy-World/wf-macro'));
    });

    it('сбой одного репозитория логируется, выбор идёт по второму', async () => {
        latest(new Error('сеть'), 'v1.1.0');

        await check();

        expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('Lazy-World/wf-macro'));
        expect(autoUpdater.setFeedURL).toHaveBeenCalledWith(WARDEN_FEED);
    });

    it('оба репозитория упали - updater:failed, проверки нет', async () => {
        latest(new Error('сеть'), new Error('404'));

        await check();

        expect(events.emit).toHaveBeenCalledWith('updater:failed', { message: expect.any(String) });
        expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
        expect(log.error).toHaveBeenCalledTimes(1);
    });

    it('приватный репозиторий: токены источников владельца по очереди, без учёта регистра', async () => {
        sourcesStore.list.mockResolvedValue([
            { id: 'a', url: 'https://github.com/Cion-Suite/one' },
            { id: 'b', url: 'git@github.com:cion-suite/two.git' },
            { id: 'c', url: 'https://github.com/other/three' },
        ]);
        sourceTokens.get.mockImplementation(async (id: string) => `tok-${id}`);
        githubMock.release.mockImplementation(async (ref: { repo: string }, token: string | null) => {
            if (ref.repo === 'wf-macro') return 'v1.0.0';
            if (token !== 'tok-b') throw new Error('нет доступа');
            return 'v1.1.0';
        });

        await check();

        expect(sourceTokens.get).not.toHaveBeenCalledWith('c');
        expect(autoUpdater.setFeedURL).toHaveBeenCalledWith({ ...WARDEN_FEED, token: 'tok-b' });
    });

    it('приватный репозиторий без токена пропускается, без запроса', async () => {
        sourceTokens.get.mockResolvedValue(null);
        latest('v1.1.0', 'v9.0.0');

        await check();

        expect(githubMock.release).toHaveBeenCalledTimes(1);
        expect(autoUpdater.setFeedURL).toHaveBeenCalledWith(MACRO_FEED);
    });

    it('токен не попадает в лог', async () => {
        latest('v1.0.0', 'v1.1.0');

        await check();

        const logged = JSON.stringify([log.info.mock.calls, log.warn.mock.calls, log.error.mock.calls]);
        expect(logged).not.toContain('tok-1');
    });

    it('плановая и ручная проверки делят одну', async () => {
        const pending: Array<(tag: string) => void> = [];
        githubMock.release.mockImplementation(() => new Promise<string>((resolve) => pending.push(resolve)));
        const { startUpdater, updaterHandlers } = await load();
        startUpdater();
        showMain();
        await vi.advanceTimersByTimeAsync(FIRST_CHECK_MS);

        const manual = updaterHandlers['updater:refresh']();
        await vi.advanceTimersByTimeAsync(0);
        for (const resolve of pending) resolve('v1.1.0');
        await manual;

        expect(githubMock.release).toHaveBeenCalledTimes(2);
        expect(autoUpdater.setFeedURL).toHaveBeenCalledTimes(1);
        expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    });
});

describe('события electron-updater', () => {
    async function listener(name: string): Promise<(...args: unknown[]) => void> {
        const { startUpdater } = await load();
        startUpdater();
        const entry = autoUpdater.on.mock.calls.find(([event]) => event === name);
        return entry![1] as (...args: unknown[]) => void;
    }

    it('error -> updater:failed с пояснённым текстом, без своего лога', async () => {
        const onError = await listener('error');

        onError(new Error("Error invoking remote method 'x:y': Error: сеть"));

        expect(events.emit).toHaveBeenCalledWith('updater:failed', { message: 'сеть' });
        expect(log.error).not.toHaveBeenCalled();
    });

    it('update-not-available -> updater:checked без нагрузки', async () => {
        const onNotAvailable = await listener('update-not-available');

        onNotAvailable();

        expect(events.emit).toHaveBeenCalledWith('updater:checked');
    });

    it('update-available эмитит версию и заметки', async () => {
        const onAvailable = await listener('update-available');
        const info = { version: '3.1.0', releaseNotes: 'заметки', releaseName: null, releaseDate: '2026-01-01' };

        onAvailable(info);

        expect(events.emit).toHaveBeenCalledWith('updater:available', {
            version: '3.1.0',
            releaseNotes: 'заметки',
            releaseName: undefined,
            releaseDate: '2026-01-01',
        });
    });

    it('releaseNotes не строкой (массив) отбрасываются', async () => {
        const onDownloaded = await listener('update-downloaded');

        onDownloaded({ version: '3.1.0', releaseNotes: [{ version: '3.1.0', note: 'x' }], releaseDate: '' });

        expect(events.emit).toHaveBeenCalledWith(
            'updater:downloaded',
            expect.objectContaining({ version: '3.1.0', releaseNotes: undefined }),
        );
    });

    it('download-progress пробрасывается как есть', async () => {
        const onProgress = await listener('download-progress');
        const progress = { percent: 40, bytesPerSecond: 100 };

        onProgress(progress);

        expect(events.emit).toHaveBeenCalledWith('updater:progress', progress);
    });
});

describe('updater:refresh', () => {
    it('проверяет фид текущего канала и ничего не возвращает', async () => {
        const { updaterHandlers } = await load();

        await expect(updaterHandlers['updater:refresh']()).resolves.toBeUndefined();

        expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    });

    it('в dev ничего не проверяет', async () => {
        electron.app.isPackaged = false;
        const { updaterHandlers } = await load();

        await expect(updaterHandlers['updater:refresh']()).resolves.toBeUndefined();

        expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    });

    it('сбой проверки оборачивается, без своего лога', async () => {
        autoUpdater.checkForUpdates.mockRejectedValue(new Error('сервер недоступен'));
        const { updaterHandlers } = await load();

        await expect(updaterHandlers['updater:refresh']()).rejects.toMatchObject({
            message: 'Update check failed: сервер недоступен',
        });
        expect(log.error).not.toHaveBeenCalled();
    });
});

describe('updater:refresh: лимит ручных проверок', () => {
    const MIN_MS = 5 * 60 * 1000;

    it('вторая проверка раньше 5 минут - rate_limited с секундами', async () => {
        const { updaterHandlers } = await load();
        await updaterHandlers['updater:refresh']();

        await vi.advanceTimersByTimeAsync(60_000);

        await expect(updaterHandlers['updater:refresh']()).rejects.toMatchObject({
            code: 'rate_limited',
            message: 'Too many update checks, retry in 240 s',
        });
        expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    });

    it('через 5 минут проверка снова разрешена', async () => {
        const { updaterHandlers } = await load();
        await updaterHandlers['updater:refresh']();

        await vi.advanceTimersByTimeAsync(MIN_MS);
        await updaterHandlers['updater:refresh']();

        expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);
    });

    it('пятая за час - отказ до истечения часа от первой', async () => {
        const { updaterHandlers } = await load();
        for (let i = 0; i < 4; i++) {
            await updaterHandlers['updater:refresh']();
            await vi.advanceTimersByTimeAsync(MIN_MS);
        }

        await expect(updaterHandlers['updater:refresh']()).rejects.toMatchObject({
            code: 'rate_limited',
            message: 'Too many update checks, retry in 2400 s',
        });

        await vi.advanceTimersByTimeAsync(2400 * 1000);
        await updaterHandlers['updater:refresh']();
        expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(5);
    });

    it('отказ не продлевает окно и не зовёт проверку', async () => {
        const { updaterHandlers } = await load();
        await updaterHandlers['updater:refresh']();
        await vi.advanceTimersByTimeAsync(MIN_MS - 1000);
        await expect(updaterHandlers['updater:refresh']()).rejects.toMatchObject({ code: 'rate_limited' });

        await vi.advanceTimersByTimeAsync(1000);
        await updaterHandlers['updater:refresh']();

        expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);
    });

    it('плановая проверка лимит не трогает', async () => {
        const { startUpdater, updaterHandlers } = await load();
        startUpdater();
        showMain();
        await vi.advanceTimersByTimeAsync(FIRST_CHECK_MS);

        await expect(updaterHandlers['updater:refresh']()).resolves.toBeUndefined();

        expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);
    });
});

describe('после скачивания обновления', () => {
    async function downloadedState() {
        const loaded = await load();
        loaded.startUpdater();
        showMain();
        const entry = autoUpdater.on.mock.calls.find(([event]) => event === 'update-downloaded');
        (entry![1] as (info: unknown) => void)({ version: '3.1.0', releaseDate: '' });
        autoUpdater.checkForUpdates.mockClear();
        return loaded;
    }

    it('плановые проверки пропускаются', async () => {
        await downloadedState();

        await vi.advanceTimersByTimeAsync(FIRST_CHECK_MS + HOUR_MS * 2);

        expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    });

    it('ручной updater:refresh работает', async () => {
        const { updaterHandlers } = await downloadedState();

        await updaterHandlers['updater:refresh']();

        expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    });
});

describe('updater:install', () => {
    it('зовёт quitAndInstall(true, true)', async () => {
        const { updaterHandlers } = await load();

        updaterHandlers['updater:install']();

        expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(true, true);
    });
});

describe('updater:changelog:get', () => {
    it('читает release.md', async () => {
        fsMock.readFile.mockResolvedValue('### Версия v1.0.0');
        const { updaterHandlers } = await load();

        await expect(updaterHandlers['updater:changelog:get']()).resolves.toBe('### Версия v1.0.0');

        expect(pathsMock.changelog).toHaveBeenCalledWith('release.md');
        expect(fsMock.readFile).toHaveBeenCalledWith('/versions/release.md', 'utf8');
    });

    it('файла нет -> null', async () => {
        fsMock.readFile.mockRejectedValue(Object.assign(new Error('нет файла'), { code: 'ENOENT' }));
        const { updaterHandlers } = await load();

        await expect(updaterHandlers['updater:changelog:get']()).resolves.toBeNull();
    });

    it('прочая ошибка чтения оборачивается', async () => {
        fsMock.readFile.mockRejectedValue(Object.assign(new Error('нет доступа'), { code: 'EACCES' }));
        const { updaterHandlers } = await load();

        await expect(updaterHandlers['updater:changelog:get']()).rejects.toMatchObject({
            message: 'Не удалось прочитать лог версий: нет доступа',
        });
    });
});

describe('stopUpdater', () => {
    it('снимает расписание', async () => {
        const { startUpdater, stopUpdater } = await load();
        startUpdater();
        showMain();
        await vi.advanceTimersByTimeAsync(FIRST_CHECK_MS);
        expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);

        stopUpdater();
        await vi.advanceTimersByTimeAsync(HOUR_MS * 3);

        expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    });

    it('без скачанного обновления quitAndInstall не зовёт', async () => {
        const { startUpdater, stopUpdater } = await load();
        startUpdater();

        stopUpdater();

        expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
    });

    it('со скачанным ставит его при выходе', async () => {
        const { startUpdater, stopUpdater } = await load();
        startUpdater();
        const entry = autoUpdater.on.mock.calls.find(([event]) => event === 'update-downloaded');
        (entry![1] as (info: unknown) => void)({ version: '3.1.0', releaseDate: '' });

        stopUpdater();

        expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(true, true);
    });
});
