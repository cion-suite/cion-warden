import type { UpdaterInfo, UpdaterProgress } from './updater';
import type { ScriptStatus } from './scripts';
import type { SourceSync } from './catalog';

/** Имя: source:action (updater - обновления). */

declare module '@cion-suite/core' {
    interface EventMap {
        'updater:checked': void;
        'updater:available': UpdaterInfo;
        'updater:progress': UpdaterProgress;
        'updater:downloaded': UpdaterInfo;
        'updater:failed': { message: string };
        'source:changed': { sourceId: string; type: 'add' | 'update' | 'remove' };
        'source:synced': SourceSync;
        'github:limit:changed': { remaining: number; reset: number };
        // libId / presetId '*' - затронуты все элементы источника
        'lib:changed': { sourceId: string; libId: string };
        'bind:changed': { sourceId: string; presetId: string };
        'script:changed': { type: 'change' | 'unlink'; filePath: string };
        'script:status:changed': { id: string; status: ScriptStatus; errorMessage?: string };
    }
}
