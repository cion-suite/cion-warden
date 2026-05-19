import fsPromises from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { shell, BrowserWindow } from 'electron';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { registerHandlers, appEvents } from '@cion-suite/core/ipc';
import type { Dirent } from 'node:fs';
import type { ScriptMeta, ScriptCfgFile } from '@shared/types/scripts.js';
import type { AppServices } from '../types/services.js';

const runningProcesses = new Map<string, ChildProcess>();

function killProcess(child: ChildProcess): void {
    if (process.platform === 'win32' && child.pid != null) {
        try {
            execSync(`taskkill /pid ${child.pid} /f /t`, { stdio: 'ignore' });
        } catch {
            // process may already be dead
        }
    } else {
        child.kill();
    }
}

const scriptStatuses = new Map<string, { status: 'idle' | 'running' | 'error'; errorMessage?: string }>();
// id → filePath, updated on every scripts:list call
const scriptPathCache = new Map<string, string>();

function makeScriptId(filePath: string): string {
    return crypto.createHash('sha1').update(filePath).digest('hex').slice(0, 16);
}

async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
    try {
        return JSON.parse(await fsPromises.readFile(filePath, 'utf-8')) as T;
    } catch {
        return undefined;
    }
}

function emitStatusChange(
    id: string,
    status: 'idle' | 'running' | 'error',
    errorMessage?: string,
): void {
    scriptStatuses.set(id, { status, errorMessage });
    for (const win of BrowserWindow.getAllWindows()) {
        appEvents.emitTo(win, 'script:status-changed', { id, status, errorMessage });
    }
}

async function listScripts(globalVaultPath: string): Promise<ScriptMeta[]> {
    const scripts: ScriptMeta[] = [];
    let vaultEntries: Dirent[] = [];
    try {
        vaultEntries = await fsPromises.readdir(globalVaultPath, { withFileTypes: true });
    } catch {
        return scripts;
    }
    for (const vault of vaultEntries) {
        if (!vault.isDirectory()) continue;
        const scriptsDir = path.join(globalVaultPath, vault.name, 'scripts');
        let files: Dirent[] = [];
        try {
            files = await fsPromises.readdir(scriptsDir, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const file of files) {
            if (!file.isFile()) continue;
            const filePath = path.join(scriptsDir, file.name);
            try {
                const stat = await fsPromises.stat(filePath);
                const ext = path.extname(file.name);
                const name = ext ? file.name.slice(0, -ext.length) : file.name;
                const cfgPath = path.join(scriptsDir, 'cfg', `${name}.json`);
                const hasCfg = fs.existsSync(cfgPath);
                const config = hasCfg ? await readJsonFile<ScriptCfgFile>(cfgPath) : undefined;
                const id = makeScriptId(filePath);
                scriptPathCache.set(id, filePath);
                const statusInfo = scriptStatuses.get(id);
                scripts.push({
                    id,
                    name,
                    filePath,
                    configPath: hasCfg ? cfgPath : undefined,
                    config,
                    status: statusInfo?.status ?? 'idle',
                    errorMessage: statusInfo?.errorMessage,
                    modifiedAt: stat.mtimeMs,
                });
            } catch {
                // skip unreadable files
            }
        }
    }
    return scripts;
}

export function registerScriptHandlers(_services: AppServices, globalVaultPath: string): void {
    registerHandlers({
        'scripts:list': () => listScripts(globalVaultPath),

        'scripts:run': async (_event, rawId: unknown) => {
            const id = String(rawId);
            if (runningProcesses.has(id)) return;
            const filePath = scriptPathCache.get(id);
            if (!filePath) return;
            emitStatusChange(id, 'running');
            const child = spawn(filePath, [], { shell: true, windowsHide: false });
            runningProcesses.set(id, child);
            child.on('exit', (code) => {
                runningProcesses.delete(id);
                const failed = code !== null && code !== 0;
                emitStatusChange(
                    id,
                    failed ? 'error' : 'idle',
                    failed ? `Exited with code ${code}` : undefined,
                );
            });
            child.on('error', (err) => {
                runningProcesses.delete(id);
                emitStatusChange(id, 'error', err.message);
            });
        },

        'scripts:stop': (_event, rawId: unknown) => {
            const id = String(rawId);
            const child = runningProcesses.get(id);
            if (!child) return;
            child.removeAllListeners('exit');
            child.removeAllListeners('error');
            killProcess(child);
            runningProcesses.delete(id);
            emitStatusChange(id, 'idle');
        },

        'scripts:stop-all': () => {
            try {
                execSync('taskkill /f /fi "IMAGENAME eq AutoHotkey*"', { stdio: 'ignore' });
            } catch {
                // no AHK processes running
            }
            for (const [id, child] of runningProcesses) {
                child.removeAllListeners('exit');
                child.removeAllListeners('error');
                killProcess(child); // clean up the shell wrapper (cmd.exe)
                emitStatusChange(id, 'idle');
            }
            runningProcesses.clear();
        },

        'scripts:delete': async (_event, rawPath: unknown) => {
            await shell.trashItem(String(rawPath));
        },

        'scripts:open-in-explorer': (_event, rawPath: unknown) => {
            shell.showItemInFolder(String(rawPath));
        },

        'scripts:config-get-values': async (_event, rawCfgPath: unknown) => {
            const valuesPath = String(rawCfgPath).replace(/\.json$/, '.values.json');
            return (await readJsonFile<Record<string, unknown>>(valuesPath)) ?? {};
        },

        'scripts:config-save-values': async (
            _event,
            rawCfgPath: unknown,
            rawValues: unknown,
        ) => {
            const valuesPath = String(rawCfgPath).replace(/\.json$/, '.values.json');
            const values = (rawValues ?? {}) as Record<string, unknown>;
            await fsPromises.writeFile(valuesPath, JSON.stringify(values, null, 2), 'utf-8');
        },
    });
}
