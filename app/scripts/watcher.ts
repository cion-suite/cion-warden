import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { events, logger } from '@cion-suite/core';
import { fsx } from '@app/utils/fsx';
import { paths } from '@app/utils/paths';

const log = logger.child('Scripts');

// На Windows fs.watch шлёт несколько событий на одну правку
const DEBOUNCE_MS = 150;

let watching: fs.FSWatcher | null = null;
const pending = new Map<string, NodeJS.Timeout>();

// <источник>/scripts/<файл>: ни cfg/, ни tmp записи не скрипты
function isScript(relative: string): boolean {
    const parts = relative.replace(/\\/g, '/').split('/');
    return parts.length === 3 && parts[1] === 'scripts' && !fsx.isTemp(parts[2]);
}

async function resolveType(filePath: string): Promise<'change' | 'unlink'> {
    try {
        await fsp.stat(filePath);
        return 'change';
    } catch {
        return 'unlink';
    }
}

function schedule(filePath: string): void {
    clearTimeout(pending.get(filePath));
    pending.set(filePath, setTimeout(() => {
        pending.delete(filePath);
        void resolveType(filePath).then(type => events.emit('script:changed', { type, filePath }));
    }, DEBOUNCE_MS));
}

/** Слежение за global_vault: script:changed на правки. */
export const watcher = {
    /** Бросает, если каталог не удалось создать или наблюдать. */
    start(): void {
        if (watching) return;
        const root = paths.vault();
        fs.mkdirSync(root, { recursive: true });
        const handle = fs.watch(root, { recursive: true }, (_type, filename) => {
            if (filename !== null && isScript(filename)) schedule(path.join(root, filename));
        });
        handle.on('error', (e) => {
            log.warn('Script watcher stopped', e);
            handle.close();
            if (watching === handle) watching = null;
        });
        watching = handle;
    },

    stop(): void {
        for (const timer of pending.values()) clearTimeout(timer);
        pending.clear();
        watching?.close();
        watching = null;
    },
};
