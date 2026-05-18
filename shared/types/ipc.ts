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
        getChannel: () => Promise<UpdaterChannelInfo>;
        setChannel: (isBeta: boolean) => Promise<UpdaterIpcResult>;
        checkForUpdates: () => Promise<UpdaterIpcResult>;
        quitAndInstall: () => Promise<void>;
    };
}
