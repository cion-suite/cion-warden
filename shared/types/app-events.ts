import type { UpdaterInfo, UpdaterProgress } from './updater.js';

declare module '@cion-suite/core/ipc' {
    interface BaseAppEventMap {
        'updater:available': UpdaterInfo;
        'updater:not-available': void;
        'updater:downloaded': UpdaterInfo;
        'updater:error': { message: string };
        'updater:progress': UpdaterProgress;
        'app:channel:changed': { isBeta: boolean };
    }
}

export {};
