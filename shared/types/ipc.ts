import type { ScriptMeta, ScriptCfgValues } from './scripts.js';
import type { VaultSource } from './vault.js';
import type { RemoteScriptMeta } from './get-scripts.js';
import type { RemoteLibraryMeta } from './libs.js';
import type { PresetSchema, PresetValues, RemotePresetMeta } from './binds.js';
import type { VaultSyncResult, VaultSourceListResult } from './vault-sync.js';

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
        probeExternal: () => Promise<{ anyRunning: boolean }>;
        run: (id: string) => Promise<void>;
        stop: (id: string) => Promise<void>;
        stopAll: () => Promise<void>;
        delete: (filePath: string) => Promise<void>;
        openInExplorer: (filePath: string) => Promise<void>;
        getConfigValues: (configPath: string) => Promise<Partial<ScriptCfgValues>>;
        saveConfigValues: (configPath: string, values: ScriptCfgValues) => Promise<void>;
    };
    sources: {
        list: () => Promise<VaultSource[]>;
        add: (source: Omit<VaultSource, 'id'>) => Promise<VaultSource>;
        remove: (id: string) => Promise<void>;
        update: (id: string, patch: Record<string, unknown>) => Promise<VaultSource>;
        setToken: (id: string, token: string) => Promise<void>;
        removeToken: (id: string) => Promise<void>;
        testToken: (id: string) => Promise<{ ok: true } | { ok: false; status: number; message: string }>;
        getTokenMask: (id: string) => Promise<string | null>;
    };
    getScripts: {
        list: () => Promise<RemoteScriptMeta[]>;
        listSource: (sourceId: string) => Promise<{ scripts: RemoteScriptMeta[]; lastSyncedAt?: number }>;
        syncSource: (sourceId: string) => Promise<{ scripts: RemoteScriptMeta[]; lastSyncedAt: number }>;
        download: (sourceId: string, fileName: string) => Promise<void>;
    };
    libs: {
        list: () => Promise<RemoteLibraryMeta[]>;
        listSource: (sourceId: string) => Promise<{ libs: RemoteLibraryMeta[]; lastSyncedAt?: number }>;
        download: (sourceId: string, libId: string) => Promise<void>;
        downloadAll: (sourceId?: string) => Promise<{ ok: number; failed: number }>;
        delete: (sourceId: string, libId: string) => Promise<void>;
        openLocal: (sourceId: string, libId: string) => Promise<void>;
        openWeb: (sourceId: string, libId: string) => Promise<void>;
    };
    binds: {
        list: () => Promise<RemotePresetMeta[]>;
        listSource: (sourceId: string) => Promise<{ presets: RemotePresetMeta[]; lastSyncedAt?: number }>;
        download: (sourceId: string, presetId: string) => Promise<void>;
        downloadAll: (sourceId?: string) => Promise<{ ok: number; failed: number }>;
        delete: (sourceId: string, presetId: string) => Promise<void>;
        openLocal: (sourceId: string, presetId: string) => Promise<void>;
        getSchema: (sourceId: string, presetId: string) => Promise<PresetSchema | null>;
        getValues: (sourceId: string, presetId: string) => Promise<PresetValues>;
        saveValues: (sourceId: string, presetId: string, values: PresetValues) => Promise<void>;
        reset: (sourceId: string, presetId: string) => Promise<void>;
    };
    vault: {
        syncSource: (sourceId: string) => Promise<VaultSyncResult>;
        syncAll: () => Promise<Array<{ sourceId: string; ok: boolean; error?: string }>>;
        listSource: (sourceId: string) => Promise<VaultSourceListResult>;
    };
}
