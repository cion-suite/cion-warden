import fsPromises from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { shell } from 'electron';
import { spawn, execFile, spawnSync, type ChildProcess } from 'node:child_process';
import { registerHandlers, appEvents } from '@cion-suite/core/ipc';
import type { Dirent } from 'node:fs';
import type { ScriptCfgFile, ScriptCfgValues, ScriptMeta, ScriptStatus } from '@shared/types/scripts.js';
import type { AppServices } from '../types/services.js';
import { readJsonFile, writeJsonFile } from '../utils/json-file.js';
import { requireString } from '../utils/ipc-args.js';

const execFileAsync = promisify(execFile);

const runningProcesses = new Map<string, ChildProcess>();
const scriptStatuses = new Map<string, { status: ScriptStatus; errorMessage?: string }>();
const scriptPathCache = new Map<string, string>();

// Spawning powershell+WMI on every list call is expensive; cache for short bursts.
const RUNNING_PATHS_TTL_MS = 1500;
let runningPathsCache: { paths: Set<string>; at: number } | null = null;

function killProcess(child: ChildProcess): void {
    if (process.platform === 'win32' && child.pid != null) {
        try {
            spawnSync('taskkill', ['/pid', String(child.pid), '/f', '/t'], { stdio: 'ignore' });
        } catch {
            // process may already be dead
        }
    } else {
        child.kill();
    }
}

function killAhkByPath(filePath: string): void {
    const escaped = filePath.replace(/'/g, "''");
    spawnSync('powershell', [
        '-NoProfile',
        '-Command',
        `Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'AutoHotkey*' -and $_.CommandLine -like '*${escaped}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`,
    ], { stdio: 'ignore' });
}

function makeScriptId(filePath: string): string {
    return crypto.createHash('sha1').update(filePath).digest('hex').slice(0, 16);
}

function emitStatusChange(id: string, status: ScriptStatus, errorMessage?: string): void {
    scriptStatuses.set(id, { status, errorMessage });
    appEvents.emit('script:status-changed', { id, status, errorMessage });
}

async function fetchRunningAhkPaths(): Promise<Set<string>> {
    try {
        const { stdout } = await execFileAsync('powershell', [
            '-NoProfile',
            '-Command',
            "Get-CimInstance Win32_Process | Where-Object Name -like 'AutoHotkey*' | Select-Object -ExpandProperty CommandLine",
        ]);
        const running = new Set<string>();
        for (const match of String(stdout).matchAll(/"([^"]+\.ahk)"/gi)) {
            if (match[1]) running.add(path.normalize(match[1]).toLowerCase());
        }
        return running;
    } catch {
        return new Set();
    }
}

async function getRunningAhkPaths(): Promise<Set<string>> {
    const now = Date.now();
    if (runningPathsCache && now - runningPathsCache.at < RUNNING_PATHS_TTL_MS) {
        return runningPathsCache.paths;
    }
    const paths = await fetchRunningAhkPaths();
    runningPathsCache = { paths, at: now };
    return paths;
}

function invalidateRunningPathsCache(): void {
    runningPathsCache = null;
}

function reconcileStatus(id: string, osRunning: boolean): { status: ScriptStatus; errorMessage?: string } {
    const prev = scriptStatuses.get(id);
    if (osRunning) {
        const next = { status: 'running' as const, errorMessage: prev?.errorMessage };
        if (prev?.status !== 'running') scriptStatuses.set(id, next);
        return next;
    }
    if (prev?.status === 'error') return prev;
    if (prev?.status !== 'idle') scriptStatuses.set(id, { status: 'idle' });
    return { status: 'idle' };
}

async function readScriptMeta(
    scriptsDir: string,
    file: Dirent,
    runningAhkPaths: Set<string>,
): Promise<ScriptMeta | null> {
    if (!file.isFile()) return null;
    const filePath = path.join(scriptsDir, file.name);
    try {
        const stat = await fsPromises.stat(filePath);
        const ext = path.extname(file.name);
        const name = ext ? file.name.slice(0, -ext.length) : file.name;
        const cfgPath = path.join(scriptsDir, 'cfg', `${name}.json`);
        const config = await readJsonFile<ScriptCfgFile>(cfgPath);
        const id = makeScriptId(filePath);
        scriptPathCache.set(id, filePath);

        const osRunning = runningAhkPaths.has(path.normalize(filePath).toLowerCase());
        const { status, errorMessage } = reconcileStatus(id, osRunning);

        return {
            id,
            name,
            filePath,
            configPath: config ? cfgPath : undefined,
            config,
            status,
            errorMessage,
            modifiedAt: stat.mtimeMs,
        };
    } catch {
        return null;
    }
}

async function listScripts(globalVaultPath: string): Promise<ScriptMeta[]> {
    const runningAhkPaths = await getRunningAhkPaths();
    let vaultEntries: Dirent[];
    try {
        vaultEntries = await fsPromises.readdir(globalVaultPath, { withFileTypes: true });
    } catch {
        return [];
    }

    const perVault = await Promise.all(
        vaultEntries.map(async (vault): Promise<ScriptMeta[]> => {
            if (!vault.isDirectory()) return [];
            const scriptsDir = path.join(globalVaultPath, vault.name, 'scripts');
            let files: Dirent[];
            try {
                files = await fsPromises.readdir(scriptsDir, { withFileTypes: true });
            } catch {
                return [];
            }
            const metas = await Promise.all(
                files.map((f) => readScriptMeta(scriptsDir, f, runningAhkPaths)),
            );
            return metas.filter((m): m is ScriptMeta => m !== null);
        }),
    );

    const scripts = perVault.flat();
    pruneStaleEntries(new Set(scripts.map((s) => s.id)));
    return scripts;
}

function pruneStaleEntries(liveIds: Set<string>): void {
    for (const id of scriptPathCache.keys()) {
        if (!liveIds.has(id)) {
            scriptPathCache.delete(id);
            scriptStatuses.delete(id);
        }
    }
}

function coerceCfgValues(raw: unknown): ScriptCfgValues {
    const r = (raw ?? {}) as Partial<ScriptCfgValues>;
    return {
        hk: r.hk && typeof r.hk === 'object' ? r.hk : {},
        val: r.val && typeof r.val === 'object' ? r.val : {},
    };
}

export function registerScriptHandlers(_services: AppServices, globalVaultPath: string): void {
    registerHandlers({
        'scripts:list': () => listScripts(globalVaultPath),

        'scripts:run': async (_event, rawId: unknown) => {
            const id = requireString(rawId, 'id');
            if (runningProcesses.has(id)) return;
            const filePath = scriptPathCache.get(id);
            if (!filePath) return;
            emitStatusChange(id, 'running');
            invalidateRunningPathsCache();
            const child = spawn(filePath, [], { shell: true, windowsHide: false });
            runningProcesses.set(id, child);
            child.on('exit', (code) => {
                runningProcesses.delete(id);
                invalidateRunningPathsCache();
                const failed = code !== null && code !== 0;
                emitStatusChange(
                    id,
                    failed ? 'error' : 'idle',
                    failed ? `Exited with code ${code}` : undefined,
                );
            });
            child.on('error', (err) => {
                runningProcesses.delete(id);
                invalidateRunningPathsCache();
                emitStatusChange(id, 'error', err.message);
            });
        },

        'scripts:stop': (_event, rawId: unknown) => {
            const id = requireString(rawId, 'id');
            const child = runningProcesses.get(id);
            if (child) {
                child.removeAllListeners('exit');
                child.removeAllListeners('error');
                killProcess(child);
                runningProcesses.delete(id);
            } else {
                const filePath = scriptPathCache.get(id);
                if (filePath) killAhkByPath(filePath);
            }
            invalidateRunningPathsCache();
            emitStatusChange(id, 'idle');
        },

        'scripts:stop-all': async () => {
            try {
                await execFileAsync('taskkill', ['/f', '/fi', 'IMAGENAME eq AutoHotkey*']);
            } catch {
                // no AHK processes running
            }
            for (const [, child] of runningProcesses) {
                child.removeAllListeners('exit');
                child.removeAllListeners('error');
                killProcess(child);
            }
            runningProcesses.clear();
            invalidateRunningPathsCache();
            for (const [id, { status }] of scriptStatuses) {
                if (status === 'running') emitStatusChange(id, 'idle');
            }
        },

        'scripts:delete': async (_event, rawPath: unknown) => {
            await shell.trashItem(requireString(rawPath, 'filePath'));
        },

        'scripts:open-in-explorer': (_event, rawPath: unknown) => {
            shell.showItemInFolder(requireString(rawPath, 'filePath'));
        },

        'scripts:config-get-values': async (_event, rawCfgPath: unknown) => {
            const valuesPath = requireString(rawCfgPath, 'configPath').replace(/\.json$/, '.values.json');
            return (await readJsonFile<Partial<ScriptCfgValues>>(valuesPath)) ?? {};
        },

        'scripts:config-save-values': async (_event, rawCfgPath: unknown, rawValues: unknown) => {
            const valuesPath = requireString(rawCfgPath, 'configPath').replace(/\.json$/, '.values.json');
            await writeJsonFile(valuesPath, coerceCfgValues(rawValues));
        },
    });
}
