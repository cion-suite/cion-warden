import { contextBridge, ipcRenderer } from 'electron';
import { exposeAppEventsBridge } from '@cion-suite/core/ipc/preload';
import type { AppBridge } from '@shared/types';

exposeAppEventsBridge();

const bridge: AppBridge = {
    signalReady: () => ipcRenderer.invoke('system:renderer-ready'),
    reportError: (payload) => ipcRenderer.invoke('errors:report', payload),
    updater: {
        checkForUpdates: () => ipcRenderer.invoke('updater:check-for-updates'),
        quitAndInstall: () => ipcRenderer.invoke('updater:quit-and-install'),
    },
    scripts: {
        list: () => ipcRenderer.invoke('scripts:list'),
        run: (id) => ipcRenderer.invoke('scripts:run', id),
        stop: (id) => ipcRenderer.invoke('scripts:stop', id),
        stopAll: () => ipcRenderer.invoke('scripts:stop-all'),
        delete: (filePath) => ipcRenderer.invoke('scripts:delete', filePath),
        openInExplorer: (filePath) => ipcRenderer.invoke('scripts:open-in-explorer', filePath),
        getConfigValues: (configPath) => ipcRenderer.invoke('scripts:config-get-values', configPath),
        saveConfigValues: (configPath, values) =>
            ipcRenderer.invoke('scripts:config-save-values', configPath, values),
    },
};

contextBridge.exposeInMainWorld('app', bridge);
