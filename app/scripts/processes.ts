import { execFile, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { errors, logger } from '@cion-suite/core';
import { scripts } from '@app/scripts';
import { cmd } from '@shared/cmd';

const log = logger.child('Scripts');
const execFileAsync = promisify(execFile);

const children = new Map<string, ChildProcess>();

// Опрос ОС через PowerShell + WMI медленный (0.5-0.8 с):
// короткий TTL склеивает серию проб подряд
const OS_PATHS_TTL_MS = 1500;
let osPaths: { paths: Set<string>; at: number } | null = null;

// Путь с кавычками или без: без пробелов их может не быть
const AHK_PATH = /(?:"([^"]+\.ahk)"|(\S+\.ahk))/gi;

/** Экранирует `*?[` и `'` для -like: иначе фильтр шире пути. */
export function escapePsLike(text: string): string {
    return text.replace(/'/g, "''").replace(/[[\]*?]/g, c => `\`${c}`);
}

function killProcess(child: ChildProcess): void {
    if (process.platform === 'win32' && child.pid !== undefined) {
        spawnSync('taskkill', ['/pid', String(child.pid), '/f', '/t'], { stdio: 'ignore' });
    } else {
        child.kill();
    }
}

function killByPath(filePath: string): void {
    const like = escapePsLike(filePath);
    spawnSync('powershell', [
        '-NoProfile',
        '-Command',
        `Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'AutoHotkey*' -and $_.CommandLine -like '*${like}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`,
    ], { stdio: 'ignore' });
}

// Слушатели снимаем: убитый процесс не должен слать exit/error
function detach(child: ChildProcess): void {
    child.removeAllListeners('exit');
    child.removeAllListeners('error');
}

async function readOsPaths(): Promise<Set<string>> {
    try {
        const { stdout } = await execFileAsync('powershell', [
            '-NoProfile',
            '-Command',
            "Get-CimInstance Win32_Process | Where-Object Name -like 'AutoHotkey*' | Select-Object -ExpandProperty CommandLine",
        ], { timeout: 5000 });
        const found = new Set<string>();
        for (const match of String(stdout).matchAll(AHK_PATH)) {
            const raw = match[1] ?? match[2];
            if (raw !== undefined) found.add(path.normalize(raw).toLowerCase());
        }
        return found;
    } catch (e) {
        log.warn('Cannot list AutoHotkey processes', e);
        return new Set();
    }
}

async function currentOsPaths(): Promise<Set<string>> {
    if (osPaths && Date.now() - osPaths.at < OS_PATHS_TTL_MS) return osPaths.paths;
    osPaths = { paths: await readOsPaths(), at: Date.now() };
    return osPaths.paths;
}

function drop(id: string): void {
    children.delete(id);
    osPaths = null;
}

/** Запущенные скрипты: свои процессы и сверка с ОС. */
export const processes = {
    run(id: string): void {
        if (children.has(id)) return;
        const filePath = scripts.path(id);
        // Путь идёт в cmd как есть: метасимвол в имени - RCE
        if (!cmd.allows(filePath)) {
            scripts.status.set(id, 'error', 'Script path contains unsafe characters');
            return;
        }
        scripts.status.set(id, 'running');
        osPaths = null;
        const child = spawn(filePath, [], { shell: true, windowsHide: false });
        children.set(id, child);
        child.on('exit', (code) => {
            drop(id);
            const failed = code !== null && code !== 0;
            scripts.status.set(id, failed ? 'error' : 'idle', failed ? `Exited with code ${code}` : undefined);
        });
        child.on('error', (e) => {
            drop(id);
            scripts.status.set(id, 'error', errors.explain(e).message);
        });
    },

    remove(id: string): void {
        const child = children.get(id);
        if (child) {
            detach(child);
            killProcess(child);
            children.delete(id);
        } else {
            killByPath(scripts.path(id));
        }
        osPaths = null;
        scripts.status.set(id, 'idle');
    },

    // Гасит ВСЕ AutoHotkey* в системе, а не только свои
    async clear(): Promise<void> {
        try {
            await execFileAsync('taskkill', ['/f', '/fi', 'IMAGENAME eq AutoHotkey*']);
        } catch {
            // Нет процессов AutoHotkey: taskkill выходит с ошибкой
        }
        for (const child of children.values()) {
            detach(child);
            killProcess(child);
        }
        children.clear();
        osPaths = null;
        for (const id of scripts.running()) scripts.status.set(id, 'idle');
    },

    /** Есть ли AHK-процесс в системе; статусы сверяются с ОС. */
    async probe(): Promise<boolean> {
        const found = await currentOsPaths();
        for (const [id, filePath] of scripts.known()) {
            const alive = found.has(path.normalize(filePath).toLowerCase());
            const status = scripts.status.get(id);
            if (alive && status !== 'running') {
                scripts.status.set(id, 'running');
            } else if (!alive && !children.has(id) && status === 'running') {
                scripts.status.set(id, 'idle');
            }
        }
        return found.size > 0 || children.size > 0;
    },
};
