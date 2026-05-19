import type { UpdaterInfo, UpdaterProgress } from './updater.js';

declare module '@cion-suite/core/ipc' {
    interface BaseAppEventMap {
        'updater:available': UpdaterInfo;
        'updater:not-available': void;
        'updater:downloaded': UpdaterInfo;
        'updater:error': { message: string };
        'updater:progress': UpdaterProgress;
        'app:channel:changed': { isBeta: boolean };
        'scripts:changed': { type: 'add' | 'change' | 'unlink'; filePath: string };
        'script:status-changed': { id: string; status: 'idle' | 'running' | 'error'; errorMessage?: string };
    }
}

export {};
