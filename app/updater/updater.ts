import pkg from 'electron-updater';
import type { UpdateInfo } from 'electron-updater';
import { app } from 'electron';
import { readFile } from 'node:fs/promises';
import * as semver from 'semver';
import { errors, events, logger, type IpcHandlers } from '@cion-suite/core';
import { github } from '@app/github';
import { shell } from '@app/shell';
import { store } from '@app/sources/store';
import { tokens } from '@app/sources/tokens';
import type { ReleaseCandidate, ReleaseTarget } from '@app/updater/types';
import { paths } from '@app/utils/paths';
import { CONFIG } from '@shared/config';
import { repo } from '@shared/repo';

const log = logger.child('Updater');

const { autoUpdater } = pkg;

const FIRST_CHECK_DELAY_MS = 3000;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

// Ручная проверка: не чаще раза в 5 минут и 4 раз в час
const MANUAL_MIN_INTERVAL_MS = 5 * 60 * 1000;
const MANUAL_MAX_PER_HOUR = 4;
const HOUR_MS = 60 * 60 * 1000;

let timers: ReturnType<typeof setTimeout>[] = [];
// Скачанное ставит stop(); кэш electron-updater повторил бы
// available / downloaded на каждой плановой проверке.
let downloaded = false;
// Плановая и ручная проверки делят одну: второй setFeedURL
// подменил бы провайдер посреди идущей
let checking: Promise<void> | null = null;
const manualChecks: number[] = [];

// Секунды до разрешённой ручной проверки; 0 - можно
function manualRetryAfter(now: number): number {
    while (manualChecks.length > 0 && manualChecks[0] <= now - HOUR_MS) manualChecks.shift();
    if (manualChecks.length === 0) return 0;
    const byInterval = manualChecks[manualChecks.length - 1] + MANUAL_MIN_INTERVAL_MS - now;
    const byHour = manualChecks.length >= MANUAL_MAX_PER_HOUR ? manualChecks[0] + HOUR_MS - now : 0;
    return Math.max(0, Math.ceil(Math.max(byInterval, byHour) / 1000));
}

// PAT источников владельца репозитория: у fine-grained
// токена может не быть доступа, поэтому пробуем все
async function ownerTokens(owner: string): Promise<string[]> {
    const sources = await store.list();
    const found = await Promise.all(
        sources
            .filter((source) => repo.parse(source.url)?.owner.toLowerCase() === owner.toLowerCase())
            .map((source) => tokens.get(source.id)),
    );
    return [...new Set(found.filter((token): token is string => token !== null))];
}

async function probe(target: ReleaseTarget, token: string | null): Promise<ReleaseCandidate> {
    const tag = await github.release(target, token);
    const version = semver.valid(tag);
    errors.assert(version, `Invalid release tag in ${target.owner}/${target.repo}`, 'failed');
    return { target, version, token };
}

async function probeTarget(target: ReleaseTarget): Promise<ReleaseCandidate> {
    if (!target.private) return probe(target, null);

    let failure: unknown = errors.fail('unauthorized', `No token for ${target.owner}/${target.repo}`);
    for (const token of await ownerTokens(target.owner)) {
        try {
            return await probe(target, token);
        } catch (error) {
            failure = error;
        }
    }
    throw failure;
}

// Самая новая версия; при равных - первый в CONFIG
async function newest(): Promise<ReleaseCandidate> {
    const targets: readonly ReleaseTarget[] = CONFIG.releases;
    const results = await Promise.allSettled(targets.map(probeTarget));

    let best: ReleaseCandidate | null = null;
    for (const [index, result] of results.entries()) {
        if (result.status === 'fulfilled') {
            if (!best || semver.gt(result.value.version, best.version)) best = result.value;
            continue;
        }
        const { owner, repo: name } = targets[index]!;
        log.warn(`Release check failed for ${owner}/${name}: ${errors.explain(result.reason).message}`);
    }
    if (!best) throw errors.fail('unavailable', 'No release repository is reachable');
    return best;
}

async function check(): Promise<void> {
    if (!app.isPackaged) {
        log.info('Skipping update check in development mode');
        return;
    }

    let winner: ReleaseCandidate;
    try {
        winner = await newest();
    } catch (error) {
        events.emit('updater:failed', { message: errors.explain(error).message });
        throw error;
    }
    const { target, version, token } = winner;
    log.info(`Latest release: ${target.owner}/${target.repo} v${version}`);

    if (!semver.gt(version, app.getVersion())) {
        events.emit('updater:checked');
        return;
    }
    autoUpdater.setFeedURL({
        provider: 'github',
        owner: target.owner,
        repo: target.repo,
        ...(token === null ? {} : { private: true, token }),
    });
    await autoUpdater.checkForUpdates();
}

function checkForUpdates(): Promise<void> {
    checking ??= check().finally(() => {
        checking = null;
    });
    return checking;
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

    'updater:changelog:get': async () => {
        try {
            return await readFile(paths.changelog('release.md'), 'utf8');
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

    // Подписчики живут в главном окне: проверка раньше
    // показа отправила бы события в пустоту.
    void shell.main.shown().then(scheduleChecks);
}

export function stopUpdater(): void {
    for (const timer of timers) {
        clearTimeout(timer);
        clearInterval(timer);
    }
    timers = [];
    // before-quit у ядра: autoInstallOnAppQuit не сработает
    if (downloaded) autoUpdater.quitAndInstall(true, true);
}
