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
        probeExternal: () => ipcRenderer.invoke('scripts:probe-external'),
        run: (id) => ipcRenderer.invoke('scripts:run', id),
        stop: (id) => ipcRenderer.invoke('scripts:stop', id),
        stopAll: () => ipcRenderer.invoke('scripts:stop-all'),
        delete: (filePath) => ipcRenderer.invoke('scripts:delete', filePath),
        openInExplorer: (filePath) => ipcRenderer.invoke('scripts:open-in-explorer', filePath),
        getConfigValues: (configPath) => ipcRenderer.invoke('scripts:config-get-values', configPath),
        saveConfigValues: (configPath, values) =>
            ipcRenderer.invoke('scripts:config-save-values', configPath, values),
        checkDeps: (id) => ipcRenderer.invoke('scripts:check-deps', id),
    },
    sources: {
        list: () => ipcRenderer.invoke('sources:list'),
        add: (source) => ipcRenderer.invoke('sources:add', source),
        remove: (id) => ipcRenderer.invoke('sources:remove', id),
        update: (id, patch) => ipcRenderer.invoke('sources:update', id, patch),
        setToken: (id, token) => ipcRenderer.invoke('sources:set-token', id, token),
        removeToken: (id) => ipcRenderer.invoke('sources:remove-token', id),
        testToken: (id) => ipcRenderer.invoke('sources:test-token', id),
        getTokenMask: (id) => ipcRenderer.invoke('sources:get-token-mask', id),
    },
    getScripts: {
        list: () => ipcRenderer.invoke('get-scripts:list'),
        listSource: (sourceId) => ipcRenderer.invoke('get-scripts:list-source', sourceId),
        syncSource: (sourceId) => ipcRenderer.invoke('get-scripts:sync-source', sourceId),
        download: (sourceId, fileName) => ipcRenderer.invoke('get-scripts:download', sourceId, fileName),
    },
    libs: {
        list: () => ipcRenderer.invoke('libs:list'),
        listSource: (sourceId) => ipcRenderer.invoke('libs:list-source', sourceId),
        download: (sourceId, libId) => ipcRenderer.invoke('libs:download', sourceId, libId),
        downloadAll: (sourceId) => ipcRenderer.invoke('libs:download-all', sourceId),
        delete: (sourceId, libId) => ipcRenderer.invoke('libs:delete', sourceId, libId),
        openLocal: (sourceId, libId) => ipcRenderer.invoke('libs:open-local', sourceId, libId),
        openWeb: (sourceId, libId) => ipcRenderer.invoke('libs:open-web', sourceId, libId),
    },
    binds: {
        list: () => ipcRenderer.invoke('binds:list'),
        listSource: (sourceId) => ipcRenderer.invoke('binds:list-source', sourceId),
        download: (sourceId, presetId) => ipcRenderer.invoke('binds:download', sourceId, presetId),
        downloadAll: (sourceId) => ipcRenderer.invoke('binds:download-all', sourceId),
        delete: (sourceId, presetId) => ipcRenderer.invoke('binds:delete', sourceId, presetId),
        openLocal: (sourceId, presetId) => ipcRenderer.invoke('binds:open-local', sourceId, presetId),
        getSchema: (sourceId, presetId) => ipcRenderer.invoke('binds:get-schema', sourceId, presetId),
        getValues: (sourceId, presetId) => ipcRenderer.invoke('binds:get-values', sourceId, presetId),
        saveValues: (sourceId, presetId, values) =>
            ipcRenderer.invoke('binds:save-values', sourceId, presetId, values),
        reset: (sourceId, presetId) => ipcRenderer.invoke('binds:reset', sourceId, presetId),
    },
    vault: {
        syncSource: (sourceId) => ipcRenderer.invoke('vault:sync-source', sourceId),
        syncAll: () => ipcRenderer.invoke('vault:sync-all'),
        listSource: (sourceId) => ipcRenderer.invoke('vault:list-source', sourceId),
    },
    github: {
        getRateLimit: () => ipcRenderer.invoke('github:rate-limit'),
    },
};

contextBridge.exposeInMainWorld('app', bridge);
