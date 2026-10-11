import { execFile, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { errors, logger } from '@cion-suite/core';
import { scripts } from '@app/scripts';
import { fsx } from '@app/utils/fsx';

const log = logger.child('Scripts');
const execFileAsync = promisify(execFile);

const children = new Map<string, ChildProcess>();
// Идёт поиск exe: повторный run того же id не плодит процесс
const pending = new Set<string>();

const REG_KEYS = [
    'HKLM\\SOFTWARE\\AutoHotkey',
    'HKLM\\SOFTWARE\\WOW6432Node\\AutoHotkey',
    'HKCU\\SOFTWARE\\AutoHotkey',
];
// Эти имена бывают только у v1: у v2 AutoHotkey.exe тоже есть
const V1_EXES = ['AutoHotkeyU64.exe', 'AutoHotkeyU32.exe'];
const UNIVERSAL_EXE = 'AutoHotkey.exe';

let ahkExe: string | null = null;
let locating: Promise<string> | null = null;

// Опрос ОС через PowerShell + WMI медленный (0.5-0.8 с):
// короткий TTL склеивает серию проб подряд
const OS_PATHS_TTL_MS = 1500;
let osPaths: { paths: Set<string>; at: number } | null = null;
// Растёт при инвалидации: старый опрос не свежий
let osGeneration = 0;
const OS_PATHS_ATTEMPTS = 2;

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

function invalidateOsPaths(): void {
    osPaths = null;
    osGeneration++;
}

// null - опрос каждый раз устаревал: состояние ОС неизвестно
async function currentOsPaths(): Promise<Set<string> | null> {
    for (let attempt = 0; attempt < OS_PATHS_ATTEMPTS; attempt++) {
        if (osPaths && Date.now() - osPaths.at < OS_PATHS_TTL_MS) return osPaths.paths;
        const generation = osGeneration;
        const paths = await readOsPaths();
        if (generation === osGeneration) {
            osPaths = { paths, at: Date.now() };
            return paths;
        }
    }
    return null;
}

function drop(id: string): void {
    children.delete(id);
    invalidateOsPaths();
}

async function readRegistry(key: string): Promise<{ dir: string; v1: boolean } | null> {
    try {
        const { stdout } = await execFileAsync('reg.exe', ['query', key], { windowsHide: true });
        const out = String(stdout);
        const dir = /^\s*InstallDir\s+REG_\w+\s+(.+?)\s*$/im.exec(out)?.[1];
        if (!dir) return null;
        const version = /^\s*Version\s+REG_\w+\s+(\S+)/im.exec(out)?.[1];
        return { dir, v1: version !== undefined && /^1\./.test(version) };
    } catch {
        // Нет ключа: reg.exe выходит с ошибкой
        return null;
    }
}

async function firstExisting(dir: string, names: string[]): Promise<string | null> {
    for (const name of names) {
        const candidate = path.join(dir, name);
        if (await fsx.exists(candidate)) return candidate;
    }
    return null;
}

// Каталоги v1.* рядом с v2, свежая версия первой
async function v1Dirs(dir: string): Promise<string[]> {
    try {
        const names = await fs.readdir(dir);
        return names
            .filter(name => /^v1\./i.test(name))
            .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
            .map(name => path.join(dir, name));
    } catch {
        return [];
    }
}

async function locate(): Promise<string | null> {
    const entries = (await Promise.all(REG_KEYS.map(readRegistry)))
        .filter(entry => entry !== null);

    for (const entry of entries.filter(item => item.v1)) {
        const found = await firstExisting(entry.dir, [...V1_EXES, UNIVERSAL_EXE]);
        if (found) return found;
    }
    for (const entry of entries) {
        for (const dir of await v1Dirs(entry.dir)) {
            const found = await firstExisting(dir, V1_EXES);
            if (found) return found;
        }
    }
    const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']];
    for (const root of new Set(roots)) {
        if (!root) continue;
        const found = await firstExisting(path.join(root, 'AutoHotkey'), V1_EXES);
        if (found) return found;
    }
    return null;
}

// Кеш только на успех: после установки AHK перезапуск не нужен
async function resolveExe(): Promise<string> {
    if (ahkExe && await fsx.exists(ahkExe)) return ahkExe;
    ahkExe = null;
    locating ??= locate()
        .then((found) => {
            if (!found) throw errors.fail('unavailable', 'AutoHotkey v1 is not installed');
            ahkExe = found;
            return found;
        })
        .finally(() => { locating = null; });
    return locating;
}

// Reload: pid выходит с 0, новый экземпляр - другой процесс
async function settleAfterExit(id: string, filePath: string): Promise<void> {
    const found = await currentOsPaths();
    if (children.has(id) || scripts.status.get(id) !== 'running') return;
    const alive = found?.has(path.normalize(filePath).toLowerCase()) ?? false;
    scripts.status.set(id, alive ? 'running' : 'idle');
}

/** Запущенные скрипты: свои процессы и сверка с ОС. */
export const processes = {
    async run(id: string): Promise<void> {
        if (children.has(id) || pending.has(id)) return;
        const filePath = scripts.path(id);
        pending.add(id);
        let exe: string | undefined;
        let failure: unknown;
        try {
            exe = await resolveExe();
        } catch (e) {
            failure = e;
        }
        // remove и clear снимают pending: запуск отменён
        if (!pending.delete(id)) return;
        if (exe === undefined) {
            scripts.status.set(id, 'error', errors.explain(failure).message);
            return;
        }
        scripts.status.set(id, 'running');
        invalidateOsPaths();
        const child = spawn(exe, ['/CP65001', filePath], { windowsHide: false });
        children.set(id, child);
        child.on('exit', (code) => {
            drop(id);
            if (code === 0) {
                void settleAfterExit(id, filePath);
                return;
            }
            const failed = code !== null;
            scripts.status.set(id, failed ? 'error' : 'idle', failed ? `Exited with code ${code}` : undefined);
        });
        child.on('error', (e) => {
            drop(id);
            scripts.status.set(id, 'error', errors.explain(e).message);
        });
    },

    remove(id: string): void {
        pending.delete(id);
        const child = children.get(id);
        if (child) {
            detach(child);
            killProcess(child);
            children.delete(id);
        } else {
            killByPath(scripts.path(id));
        }
        invalidateOsPaths();
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
        pending.clear();
        invalidateOsPaths();
        for (const id of scripts.running()) scripts.status.set(id, 'idle');
    },

    /** Есть ли AHK-процесс в системе; статусы сверяются с ОС. */
    async probe(): Promise<boolean> {
        const found = await currentOsPaths();
        if (!found) return children.size > 0;
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
