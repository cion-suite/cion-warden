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
    sources: {
        list: () => ipcRenderer.invoke('sources:list'),
        add: (source) => ipcRenderer.invoke('sources:add', source),
        remove: (id) => ipcRenderer.invoke('sources:remove', id),
        update: (id, patch) => ipcRenderer.invoke('sources:update', id, patch),
    },
    getScripts: {
        list: () => ipcRenderer.invoke('get-scripts:list'),
        listSource: (sourceId) => ipcRenderer.invoke('get-scripts:list-source', sourceId),
        syncSource: (sourceId) => ipcRenderer.invoke('get-scripts:sync-source', sourceId),
        download: (sourceId, fileName) => ipcRenderer.invoke('get-scripts:download', sourceId, fileName),
    },
};

contextBridge.exposeInMainWorld('app', bridge);
