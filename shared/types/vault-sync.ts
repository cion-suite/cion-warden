import type { RemoteScriptMeta } from './get-scripts.js';
import type { RemoteLibraryMeta } from './libs.js';
import type { RemotePresetMeta } from './binds.js';

export interface VaultSyncResult {
    scripts: RemoteScriptMeta[];
    libs: RemoteLibraryMeta[];
    presets: RemotePresetMeta[];
    lastSyncedAt: number;
    fromCache: boolean;
    rateLimitRemaining?: number;
    rateLimitReset?: number;
}

export interface VaultSourceListResult {
    scripts: RemoteScriptMeta[];
    libs: RemoteLibraryMeta[];
    presets: RemotePresetMeta[];
    lastSyncedAt?: number;
}
