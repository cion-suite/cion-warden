import pkg from 'electron-updater';
import type { UpdateInfo } from 'electron-updater';
import { app } from 'electron';
import { readFile } from 'node:fs/promises';
import { errors, events, logger, settings, type IpcHandlers } from '@cion-suite/core';
import { shell } from '@app/shell';
import { paths } from '@app/utils/paths';
import { CONFIG } from '@shared/config';

const log = logger.child('Updater');

const { autoUpdater } = pkg;

type UpdateFeed = { url: string; channel: 'latest' | 'beta' };

const LATEST_FEED: UpdateFeed = { url: CONFIG.feeds.latestUrl, channel: 'latest' };
const BETA_FEED: UpdateFeed = { url: CONFIG.feeds.betaUrl, channel: 'beta' };

const FIRST_CHECK_DELAY_MS = 3000;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

// Ручная проверка: не чаще раза в 5 минут и 4 раз в час
const MANUAL_MIN_INTERVAL_MS = 5 * 60 * 1000;
const MANUAL_MAX_PER_HOUR = 4;
const HOUR_MS = 60 * 60 * 1000;

let timers: ReturnType<typeof setTimeout>[] = [];
let unsubscribe: (() => void) | undefined;
// Скачанное ставит stop(); кэш electron-updater повторил бы
// available / downloaded на каждой плановой проверке.
let downloaded = false;
const manualChecks: number[] = [];

// Секунды до разрешённой ручной проверки; 0 - можно
function manualRetryAfter(now: number): number {
    while (manualChecks.length > 0 && manualChecks[0] <= now - HOUR_MS) manualChecks.shift();
    if (manualChecks.length === 0) return 0;
    const byInterval = manualChecks[manualChecks.length - 1] + MANUAL_MIN_INTERVAL_MS - now;
    const byHour = manualChecks.length >= MANUAL_MAX_PER_HOUR ? manualChecks[0] + HOUR_MS - now : 0;
    return Math.max(0, Math.ceil(Math.max(byInterval, byHour) / 1000));
}

function currentFeed(): UpdateFeed {
    return settings.get('updaterBeta') ? BETA_FEED : LATEST_FEED;
}

async function checkForUpdates(): Promise<void> {
    if (!app.isPackaged) {
        log.info('Skipping update check in development mode');
        return;
    }

    const feed = currentFeed();
    autoUpdater.setFeedURL({ provider: 'generic', url: feed.url, channel: feed.channel });
    // Переход с beta на latest - откат версии
    autoUpdater.allowDowngrade = feed.channel === 'latest';
    log.info(`Feed URL set to: ${feed.url} (${feed.channel})`);
    await autoUpdater.checkForUpdates();
}

function emitUpdateInfo(eventName: 'updater:available' | 'updater:downloaded', info: UpdateInfo): void {
    events.emit(eventName, {
        version: info.version,
        releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
        releaseName: info.releaseName ?? undefined,
        releaseDate: info.releaseDate,
    });
}

function runCheck(): void {
    if (downloaded) return;
    void checkForUpdates().catch((error) => log.error('Check for updates error:', error));
}

function scheduleChecks(): void {
    timers = [setTimeout(runCheck, FIRST_CHECK_DELAY_MS), setInterval(runCheck, CHECK_INTERVAL_MS)];
}

export const updaterHandlers = {
    'updater:refresh': async () => {
        const now = Date.now();
        const retryAfter = manualRetryAfter(now);
        if (retryAfter > 0) {
            throw errors.fail('rate_limited', `Too many update checks, retry in ${retryAfter} s`);
        }
        manualChecks.push(now);
        try {
            await checkForUpdates();
        } catch (error) {
            throw errors.wrap(error, 'Update check failed');
        }
    },

    'updater:install': () => {
        // Спавнит инсталлятор detached и сам зовёт app.quit(); ошибки
        // уходят в 'error' -> событие, свой catch не нужен.
        autoUpdater.quitAndInstall(true, true);
    },

    // Версия с суффиксом (-beta.N) - лог беты, иначе релиза
    'updater:changelog:get': async () => {
        const file = app.getVersion().includes('-') ? 'beta.md' : 'release.md';
        try {
            return await readFile(paths.changelog(file), 'utf8');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
            throw errors.wrap(error, 'Не удалось прочитать лог версий');
        }
    },
} satisfies IpcHandlers;

export function startUpdater(): void {
    shell.splash.update({ progress: 70, status: 'Configuring updater' });
    autoUpdater.logger = log;

    autoUpdater.on('update-available', (info) => emitUpdateInfo('updater:available', info));
    autoUpdater.on('update-not-available', () => events.emit('updater:checked'));
    autoUpdater.on('download-progress', (progress) => events.emit('updater:progress', progress));
    autoUpdater.on('update-downloaded', (info) => {
        downloaded = true;
        emitUpdateInfo('updater:downloaded', info);
    });
    // Ошибку уже залогировал сам electron-updater
    autoUpdater.on('error', (error) => events.emit('updater:failed', { message: errors.explain(error).message }));

    // Смена канала сразу проверяет новый фид
    unsubscribe = settings.on('updaterBeta', runCheck);

    // Подписчики живут в главном окне: проверка раньше
    // показа отправила бы события в пустоту.
    void shell.main.shown().then(scheduleChecks);
}

export function stopUpdater(): void {
    unsubscribe?.();
    for (const timer of timers) {
        clearTimeout(timer);
        clearInterval(timer);
    }
    timers = [];
    // before-quit у ядра: autoInstallOnAppQuit не сработает
    if (downloaded) autoUpdater.quitAndInstall(true, true);
}
