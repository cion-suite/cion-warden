import type { UpdaterInfo, UpdaterProgress } from './updater.js';
import type { ScriptStatus } from './scripts.js';

declare module '@cion-suite/core/ipc' {
    interface BaseAppEventMap {
        'updater:available': UpdaterInfo;
        'updater:not-available': void;
        'updater:downloaded': UpdaterInfo;
        'updater:error': { message: string };
        'updater:progress': UpdaterProgress;
        'app:channel:changed': { isBeta: boolean };
        'scripts:changed': { type: 'add' | 'change' | 'unlink'; filePath: string };
        'script:status-changed': { id: string; status: ScriptStatus; errorMessage?: string };
        'vault:source-synced': {
            sourceId: string;
            lastSyncedAt: number;
            fromCache: boolean;
        };
        'vault:rate-limit': { remaining: number; reset: number };
        'libs:changed': { sourceId: string; libId: string };
    }
}

export {};
