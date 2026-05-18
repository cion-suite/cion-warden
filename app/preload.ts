import { contextBridge, ipcRenderer } from 'electron';
import { exposeAppEventsBridge } from '@cion-suite/core/ipc/preload';
import type { AppBridge } from '@shared/types';

exposeAppEventsBridge();

const bridge: AppBridge = {
    signalReady: () => ipcRenderer.invoke('system:renderer-ready'),
    reportError: (payload) => ipcRenderer.invoke('errors:report', payload),
    updater: {
        getChannel: () => ipcRenderer.invoke('updater:get-channel'),
        setChannel: (isBeta) => ipcRenderer.invoke('updater:set-channel', isBeta),
        checkForUpdates: () => ipcRenderer.invoke('updater:check-for-updates'),
        quitAndInstall: () => ipcRenderer.invoke('updater:quit-and-install'),
    },
};

contextBridge.exposeInMainWorld('app', bridge);
