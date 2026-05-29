import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { events } from '@cion-suite/core/events';

export interface ScriptWatcher {
    start(globalVaultPath: string): void;
    stop(): void;
}

// fs.watch on Windows fires multiple events per change; batch them.
const DEBOUNCE_MS = 150;

function isScriptFile(relativePath: string): boolean {
    // Expect: <vaultName>/scripts/<filename> — exclude nested dirs like cfg/.
    const parts = relativePath.replace(/\\/g, '/').split('/');
    return parts.length === 3 && parts[1] === 'scripts';
}

async function resolveType(filePath: string): Promise<'add' | 'change' | 'unlink'> {
    try {
        await fsPromises.stat(filePath);
        return 'change';
    } catch {
        return 'unlink';
    }
}

export function createScriptWatcher(): ScriptWatcher {
    let watcher: fs.FSWatcher | null = null;
    const pending = new Map<string, NodeJS.Timeout>();

    function schedule(filePath: string): void {
        const existing = pending.get(filePath);
        if (existing) clearTimeout(existing);
        const handle = setTimeout(() => {
            pending.delete(filePath);
            void resolveType(filePath).then((type) => {
                events.emit('scripts:changed', { type, filePath });
            });
        }, DEBOUNCE_MS);
        pending.set(filePath, handle);
    }

    return {
        start(globalVaultPath: string) {
            if (watcher) return;
            try {
                fs.mkdirSync(globalVaultPath, { recursive: true });
                watcher = fs.watch(globalVaultPath, { recursive: true }, (_eventType, filename) => {
                    if (!filename || !isScriptFile(filename)) return;
                    schedule(path.join(globalVaultPath, filename));
                });
                watcher.on('error', () => {
                    watcher = null;
                });
            } catch {
                // global_vault not watchable yet
            }
        },
        stop() {
            for (const handle of pending.values()) clearTimeout(handle);
            pending.clear();
            watcher?.close();
            watcher = null;
        },
    };
}
