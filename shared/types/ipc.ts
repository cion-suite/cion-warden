import type { ScriptMeta } from './scripts.js';

export type UpdaterIpcResult = { ok: true } | { ok: false; error: string };

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
        delete: (filePath: string) => Promise<void>;
        openInExplorer: (filePath: string) => Promise<void>;
        getConfigValues: (configPath: string) => Promise<Record<string, unknown>>;
        saveConfigValues: (configPath: string, values: Record<string, unknown>) => Promise<void>;
    };
}
