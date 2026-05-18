import { app } from 'electron';
import pkg from 'electron-updater';
import { z } from 'zod';
import { appEvents, registerHandlers } from '@cion-suite/core/ipc';
import { createSettingsStore } from '@cion-suite/core/settings';

import type { UpdaterIpcResult } from '@shared/types';

import type {
    AutoUpdaterController,
    CreateAutoUpdaterOptions,
    UpdaterChannel,
} from '../types/updater.js';

const { autoUpdater } = pkg;

const updaterStoreSchema = z.object({
    betaChannel: z.boolean().default(false),
});

export function createAutoUpdater(opts: CreateAutoUpdaterOptions): AutoUpdaterController {
    const log = opts.logger;
    let updateDownloaded = false;

    const store = createSettingsStore({
        appId: opts.appId,
        schema: updaterStoreSchema,
        defaults: { betaChannel: false },
        currentVersion: app.getVersion(),
        name: opts.storeName ?? 'updater',
    });

    const isBeta = (): boolean => store.get('betaChannel');

    function resolveFeed(): { url: string; channel: UpdaterChannel } {
        if (isBeta() && opts.feed.betaUrl) {
            return { url: opts.feed.betaUrl, channel: 'beta' };
        }
        return { url: opts.feed.latestUrl, channel: 'latest' };
    }

    let lastFeed: { url: string; channel: UpdaterChannel } | null = null;

    function applyFeed(): void {
        const feed = resolveFeed();
        if (lastFeed && lastFeed.url === feed.url && lastFeed.channel === feed.channel) return;
        autoUpdater.setFeedURL({
            provider: 'generic',
            url: feed.url,
            channel: feed.channel,
        });
        lastFeed = feed;
        log?.info('updater feed set', feed.url, feed.channel);
    }

    autoUpdater.autoDownload = true;
    // main.ts before-quit handler installs pending updates explicitly; autoInstallOnAppQuit=true
    // would race against that path on quitAndInstall.
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowDowngrade = !isBeta();
    applyFeed();

    autoUpdater.on('checking-for-update', () => log?.info('updater: checking'));
    autoUpdater.on('update-available', (info) => {
        log?.info('updater: available', info.version);
        appEvents.emit('updater:available', {
            version: info.version,
            releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
            releaseName: info.releaseName ?? undefined,
            releaseDate: info.releaseDate,
        });
    });
    autoUpdater.on('update-not-available', () => {
        log?.info('updater: not available');
        appEvents.emit('updater:not-available');
    });
    autoUpdater.on('error', (err) => {
        log?.error('updater error', err);
        appEvents.emit('updater:error', { message: err.message });
    });
    autoUpdater.on('download-progress', (p) => {
        appEvents.emit('updater:progress', {
            bytesPerSecond: p.bytesPerSecond,
            percent: p.percent,
            transferred: p.transferred,
            total: p.total,
        });
    });
    autoUpdater.on('update-downloaded', (info) => {
        log?.info('updater: downloaded', info.version);
        updateDownloaded = true;
        appEvents.emit('updater:downloaded', {
            version: info.version,
            releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
            releaseName: info.releaseName ?? undefined,
            releaseDate: info.releaseDate,
        });
    });

    function installPendingUpdate(): void {
        try {
            autoUpdater.quitAndInstall(true, true);
        } catch (error) {
            log?.error('installPendingUpdate failed', error);
            // Bypass before-quit re-entry — quitAndInstall already failed once.
            app.exit(1);
        }
    }

    async function scheduledCheck(): Promise<void> {
        if (!app.isPackaged) {
            log?.info('updater: skipped (dev mode)');
            return;
        }
        try {
            applyFeed();
            await autoUpdater.checkForUpdates();
        } catch (error) {
            log?.error('updater check failed', error);
        }
    }

    async function runCheck(): Promise<UpdaterIpcResult> {
        try {
            applyFeed();
            await autoUpdater.checkForUpdates();
            return { ok: true };
        } catch (error) {
            return { ok: false, error: (error as Error).message };
        }
    }

    registerHandlers({
        'updater:check-for-updates': runCheck,
        'updater:quit-and-install': () => {
            installPendingUpdate();
        },
        'updater:get-channel': () => ({ isBeta: isBeta() }),
        'updater:set-channel': async (_event, payload: unknown) => {
            const parsed = z.boolean().safeParse(payload);
            if (!parsed.success) {
                return { ok: false, error: 'invalid payload: nextBeta must be boolean' };
            }
            const nextBeta = parsed.data;
            store.set('betaChannel', nextBeta);
            autoUpdater.allowDowngrade = !nextBeta;
            appEvents.emit('app:channel:changed', { isBeta: nextBeta });
            return runCheck();
        },
    });

    const checkTimeoutId = setTimeout(() => {
        void scheduledCheck();
    }, opts.initialDelay ?? 3000);

    const checkIntervalId = setInterval(
        () => {
            void scheduledCheck();
        },
        opts.checkInterval ?? 60 * 60 * 1000
    );

    function dispose(): void {
        clearTimeout(checkTimeoutId);
        clearInterval(checkIntervalId);
    }

    return {
        isUpdateDownloaded: () => updateDownloaded,
        installPendingUpdate,
        dispose,
    };
}
