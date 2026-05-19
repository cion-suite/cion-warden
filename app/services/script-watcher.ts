import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow } from 'electron';
import { appEvents } from '@cion-suite/core/ipc';

export interface ScriptWatcher {
    start(globalVaultPath: string): void;
    stop(): void;
}

function isScriptFile(relativePath: string): boolean {
    // Expect: <vaultName>/<scripts>/<filename> — depth 3, not inside cfg/
    const parts = relativePath.replace(/\\/g, '/').split('/');
    return parts.length === 3 && parts[1] === 'scripts';
}

export function createScriptWatcher(): ScriptWatcher {
    let watcher: fs.FSWatcher | null = null;

    return {
        start(globalVaultPath: string) {
            if (watcher) return;
            try {
                fs.mkdirSync(globalVaultPath, { recursive: true });
                watcher = fs.watch(globalVaultPath, { recursive: true }, (eventType, filename) => {
                    if (!filename || !isScriptFile(filename)) return;
                    const filePath = path.join(globalVaultPath, filename);
                    const type =
                        eventType === 'rename'
                            ? fs.existsSync(filePath)
                                ? 'add'
                                : 'unlink'
                            : 'change';
                    for (const win of BrowserWindow.getAllWindows()) {
                        appEvents.emitTo(win, 'scripts:changed', { type, filePath });
                    }
                });
                watcher.on('error', () => {
                    watcher = null;
                });
            } catch {
                // global_vault not watchable — ignore until it's created
            }
        },
        stop() {
            watcher?.close();
            watcher = null;
        },
    };
}
