import type { ScriptMeta } from './scripts.js';
import type { VaultSource } from './vault.js';
import type { RemoteScriptMeta } from './get-scripts.js';

export type UpdaterIpcResult =
    | { ok: true }
    | { ok: false; error: 'rate_limit'; retryAfter: number }
    | { ok: false; error: string };

export interface UpdaterChannelInfo {
    isBeta: boolean;
}

export interface ErrorReport {
    message: string;
    stack?: string;
    componentStack?: string;
}

export interface AppBridge {
    signalReady: () => Promise<void>;
    reportError: (payload: ErrorReport) => Promise<void>;
    updater: {
        checkForUpdates: () => Promise<UpdaterIpcResult>;
        quitAndInstall: () => Promise<void>;
    };
    scripts: {
        list: () => Promise<ScriptMeta[]>;
        run: (id: string) => Promise<void>;
        stop: (id: string) => Promise<void>;
        stopAll: () => Promise<void>;
        delete: (filePath: string) => Promise<void>;
        openInExplorer: (filePath: string) => Promise<void>;
        getConfigValues: (configPath: string) => Promise<Record<string, unknown>>;
        saveConfigValues: (configPath: string, values: Record<string, unknown>) => Promise<void>;
    };
    sources: {
        list: () => Promise<VaultSource[]>;
        add: (source: Omit<VaultSource, 'id'>) => Promise<VaultSource>;
        remove: (id: string) => Promise<void>;
        update: (id: string, patch: Record<string, unknown>) => Promise<VaultSource>;
    };
    getScripts: {
        list: () => Promise<RemoteScriptMeta[]>;
        listSource: (sourceId: string) => Promise<{ scripts: RemoteScriptMeta[]; lastSyncedAt?: number }>;
        syncSource: (sourceId: string) => Promise<{ scripts: RemoteScriptMeta[]; lastSyncedAt: number }>;
        download: (sourceId: string, fileName: string) => Promise<void>;
    };
}
