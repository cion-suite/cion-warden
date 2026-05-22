import type { RemoteScriptMeta } from './get-scripts.js';
import type { RemoteLibraryMeta } from './libs.js';

export interface VaultSyncResult {
    scripts: RemoteScriptMeta[];
    libs: RemoteLibraryMeta[];
    lastSyncedAt: number;
    fromCache: boolean;
    rateLimitRemaining?: number;
    rateLimitReset?: number;
}

export interface VaultSourceListResult {
    scripts: RemoteScriptMeta[];
    libs: RemoteLibraryMeta[];
    lastSyncedAt?: number;
}
