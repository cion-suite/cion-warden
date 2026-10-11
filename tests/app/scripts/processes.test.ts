import { EventEmitter } from 'node:events';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Processes = typeof import('@app/scripts/processes').processes;

const cp = vi.hoisted(() => ({ spawn: vi.fn(), spawnSync: vi.fn(), execFile: vi.fn() }));
const disk = vi.hoisted(() => ({ files: new Set<string>(), dirs: new Map<string, string[]>() }));
const system = vi.hoisted(() => ({ registry: new Map<string, string>(), ps: vi.fn() }));
const registry = vi.hoisted(() => ({
    files: new Map<string, string>(),
    path: vi.fn(),
    status: { set: vi.fn(), get: vi.fn() },
    running: vi.fn(),
    known: vi.fn(),
}));

vi.mock('node:child_process', () => cp);
vi.mock('node:fs/promises', () => ({
    default: {
        readdir: (dir: string) => disk.dirs.has(dir)
            ? Promise.resolve(disk.dirs.get(dir))
            : Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
    },
}));
vi.mock('@app/utils/fsx', () => ({ fsx: { exists: (file: string) => Promise.resolve(disk.files.has(file)) } }));
vi.mock('@app/scripts', () => ({ scripts: registry }));

class Child extends EventEmitter {
    pid = 42;
    kill = vi.fn();
}

const HKLM = 'HKLM\\SOFTWARE\\AutoHotkey';
const WOW = 'HKLM\\SOFTWARE\\WOW6432Node\\AutoHotkey';
const HKCU = 'HKCU\\SOFTWARE\\AutoHotkey';
const AHK_DIR = 'C:\\Program Files\\AutoHotkey';
const exe = (dir: string, name: string): string => path.join(dir, name);
const regOut = (dir: string, version: string): string =>
    `\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\AutoHotkey\r\n    InstallDir    REG_SZ    ${dir}\r\n    Version    REG_SZ    ${version}\r\n\r\n`;
const commandLine = (filePath: string): string =>
    `"C:\\Program Files\\AutoHotkey\\AutoHotkeyU64.exe" /CP65001 "${filePath}"\r\n`;

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    return { promise, resolve };
}

let processes: Processes;
let escapePsLike: (text: string) => string;

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

function regQueries(): unknown[][] {
    return cp.execFile.mock.calls.filter(call => call[0] === 'reg.exe');
}

beforeEach(async () => {
    vi.resetModules();
    for (const fn of [cp.spawn, cp.spawnSync, cp.execFile, system.ps, registry.path, registry.status.set, registry.status.get, registry.running, registry.known]) fn.mockReset();
    disk.files.clear();
    disk.dirs.clear();
    system.registry.clear();
    registry.files.clear();
    registry.path.mockImplementation((id: string) => {
        const file = registry.files.get(id);
        if (file === undefined) throw Object.assign(new Error('nope'), { code: 'not_found' });
        return file;
    });
    registry.running.mockReturnValue([]);
    registry.known.mockReturnValue(new Map());
    system.ps.mockResolvedValue('');
    cp.execFile.mockImplementation((command: string, args: string[], ...rest: unknown[]) => {
        const done = rest.at(-1) as (e: Error | null, out?: { stdout: string }) => void;
        if (command === 'reg.exe') {
            const out = system.registry.get(args[1] ?? '');
            if (out === undefined) done(Object.assign(new Error('not found'), { code: 1 }));
            else done(null, { stdout: out });
        } else if (command === 'powershell') {
            system.ps().then((stdout: string) => done(null, { stdout }));
        } else {
            done(null, { stdout: '' });
        }
    });
    vi.stubEnv('ProgramFiles', 'C:\\PF');
    vi.stubEnv('ProgramFiles(x86)', 'C:\\PF86');
    ({ processes, escapePsLike } = await import('@app/scripts/processes'));
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('escapePsLike', () => {
    it('экранирует wildcard-символы PowerShell -like', () => {
        expect(escapePsLike('C:\\a[1]\\b*?.ahk')).toBe('C:\\a`[1`]\\b`*`?.ahk');
    });

    it('удваивает одинарную кавычку', () => {
        expect(escapePsLike("C:\\it's.ahk")).toBe("C:\\it''s.ahk");
    });

    it('обычный путь не меняется', () => {
        expect(escapePsLike('C:\\dir with space\\x.ahk')).toBe('C:\\dir with space\\x.ahk');
    });
});

describe('processes.run: поиск AutoHotkey v1', () => {
    beforeEach(() => {
        cp.spawn.mockImplementation(() => new Child());
        registry.files.set('ok', 'C:\\v\\ok.ahk');
    });

    it.each([
        ['HKLM', HKLM],
        ['WOW6432Node', WOW],
        ['HKCU', HKCU],
    ])('v1 из реестра %s', async (_name, key) => {
        system.registry.set(key, regOut(AHK_DIR, '1.1.37.02'));
        disk.files.add(exe(AHK_DIR, 'AutoHotkeyU64.exe'));

        await processes.run('ok');

        expect(cp.spawn).toHaveBeenCalledWith(exe(AHK_DIR, 'AutoHotkeyU64.exe'), expect.any(Array), expect.anything());
    });

    it('AutoHotkeyU64.exe предпочтительнее U32', async () => {
        system.registry.set(HKLM, regOut(AHK_DIR, '1.1.37.02'));
        disk.files.add(exe(AHK_DIR, 'AutoHotkeyU32.exe'));
        disk.files.add(exe(AHK_DIR, 'AutoHotkeyU64.exe'));

        await processes.run('ok');

        expect(cp.spawn.mock.calls[0]?.[0]).toBe(exe(AHK_DIR, 'AutoHotkeyU64.exe'));
    });

    it('AutoHotkey.exe берётся, когда реестр подтвердил Version 1.x', async () => {
        system.registry.set(HKLM, regOut(AHK_DIR, '1.1.37.02'));
        disk.files.add(exe(AHK_DIR, 'AutoHotkey.exe'));

        await processes.run('ok');

        expect(cp.spawn.mock.calls[0]?.[0]).toBe(exe(AHK_DIR, 'AutoHotkey.exe'));
    });

    it('Version 2.x: AutoHotkey.exe отвергается', async () => {
        system.registry.set(HKLM, regOut(AHK_DIR, '2.0.18'));
        disk.files.add(exe(AHK_DIR, 'AutoHotkey.exe'));
        disk.files.add(exe(AHK_DIR, 'AutoHotkey64.exe'));

        await processes.run('ok');

        expect(cp.spawn).not.toHaveBeenCalled();
        expect(registry.status.set).toHaveBeenCalledWith('ok', 'error', expect.stringContaining('AutoHotkey v1 is not installed'));
    });

    it('v1 рядом с v2: свежий каталог v1.* внутри InstallDir', async () => {
        system.registry.set(HKLM, regOut(AHK_DIR, '2.0.18'));
        disk.dirs.set(AHK_DIR, ['v1.1.36.00', 'v2', 'v1.1.37.02', 'UX']);
        disk.files.add(exe(path.join(AHK_DIR, 'v1.1.36.00'), 'AutoHotkeyU64.exe'));
        disk.files.add(exe(path.join(AHK_DIR, 'v1.1.37.02'), 'AutoHotkeyU64.exe'));
        disk.files.add(exe(AHK_DIR, 'AutoHotkey.exe'));

        await processes.run('ok');

        expect(cp.spawn.mock.calls[0]?.[0]).toBe(exe(path.join(AHK_DIR, 'v1.1.37.02'), 'AutoHotkeyU64.exe'));
    });

    it('v1.*: AutoHotkey.exe внутри подкаталога не берётся', async () => {
        system.registry.set(HKLM, regOut(AHK_DIR, '2.0.18'));
        disk.dirs.set(AHK_DIR, ['v1.1.37.02']);
        disk.files.add(exe(path.join(AHK_DIR, 'v1.1.37.02'), 'AutoHotkey.exe'));

        await processes.run('ok');

        expect(cp.spawn).not.toHaveBeenCalled();
    });

    it('v1 в реестре идёт раньше v1.* соседней установки', async () => {
        system.registry.set(HKLM, regOut('C:\\v2', '2.0.18'));
        system.registry.set(HKCU, regOut(AHK_DIR, '1.1.37.02'));
        disk.dirs.set('C:\\v2', ['v1.1.37.02']);
        disk.files.add(exe(path.join('C:\\v2', 'v1.1.37.02'), 'AutoHotkeyU64.exe'));
        disk.files.add(exe(AHK_DIR, 'AutoHotkeyU64.exe'));

        await processes.run('ok');

        expect(cp.spawn.mock.calls[0]?.[0]).toBe(exe(AHK_DIR, 'AutoHotkeyU64.exe'));
    });

    it('без реестра - ProgramFiles', async () => {
        disk.files.add(exe('C:\\PF\\AutoHotkey', 'AutoHotkeyU32.exe'));

        await processes.run('ok');

        expect(cp.spawn.mock.calls[0]?.[0]).toBe(exe('C:\\PF\\AutoHotkey', 'AutoHotkeyU32.exe'));
    });

    it('без реестра - ProgramFiles(x86)', async () => {
        disk.files.add(exe('C:\\PF86\\AutoHotkey', 'AutoHotkeyU64.exe'));

        await processes.run('ok');

        expect(cp.spawn.mock.calls[0]?.[0]).toBe(exe('C:\\PF86\\AutoHotkey', 'AutoHotkeyU64.exe'));
    });

    it('в ProgramFiles AutoHotkey.exe без подтверждения не берётся', async () => {
        disk.files.add(exe('C:\\PF\\AutoHotkey', 'AutoHotkey.exe'));

        await processes.run('ok');

        expect(cp.spawn).not.toHaveBeenCalled();
    });

    it('exe не найден: error, run не падает, running не мигает', async () => {
        await expect(processes.run('ok')).resolves.toBeUndefined();

        expect(cp.spawn).not.toHaveBeenCalled();
        expect(registry.status.set).toHaveBeenCalledTimes(1);
        expect(registry.status.set).toHaveBeenCalledWith('ok', 'error', 'AutoHotkey v1 is not installed');
    });

    it('неудача не кешируется: после установки AHK запуск проходит', async () => {
        await processes.run('ok');
        disk.files.add(exe('C:\\PF\\AutoHotkey', 'AutoHotkeyU64.exe'));

        await processes.run('ok');

        expect(cp.spawn).toHaveBeenCalledTimes(1);
        expect(registry.status.set).toHaveBeenLastCalledWith('ok', 'running');
    });

    it('найденный exe кешируется: реестр второй раз не читается', async () => {
        registry.files.set('two', 'C:\\v\\two.ahk');
        system.registry.set(HKLM, regOut(AHK_DIR, '1.1.37.02'));
        disk.files.add(exe(AHK_DIR, 'AutoHotkeyU64.exe'));

        await processes.run('ok');
        await processes.run('two');

        expect(regQueries()).toHaveLength(3);
        expect(cp.spawn).toHaveBeenCalledTimes(2);
    });

    it('кеш с удалённым exe сбрасывается и ищется заново', async () => {
        registry.files.set('two', 'C:\\v\\two.ahk');
        disk.files.add(exe('C:\\PF\\AutoHotkey', 'AutoHotkeyU64.exe'));
        await processes.run('ok');
        disk.files.clear();
        disk.files.add(exe('C:\\PF86\\AutoHotkey', 'AutoHotkeyU64.exe'));

        await processes.run('two');

        expect(cp.spawn.mock.calls[1]?.[0]).toBe(exe('C:\\PF86\\AutoHotkey', 'AutoHotkeyU64.exe'));
    });
});

describe('processes.run: запуск', () => {
    const ahk = exe(AHK_DIR, 'AutoHotkeyU64.exe');

    beforeEach(() => {
        system.registry.set(HKLM, regOut(AHK_DIR, '1.1.37.02'));
        disk.files.add(ahk);
    });

    it('неизвестный id - not_found', async () => {
        await expect(processes.run('x')).rejects.toMatchObject({ code: 'not_found' });
    });

    it('spawn без shell, путь отдельным аргументом после /CP65001', async () => {
        const child = new Child();
        cp.spawn.mockReturnValue(child);
        registry.files.set('ok', 'C:\\v\\ok.ahk');

        await processes.run('ok');

        expect(cp.spawn).toHaveBeenCalledWith(ahk, ['/CP65001', 'C:\\v\\ok.ahk'], { windowsHide: false });
        expect(registry.status.set).toHaveBeenCalledWith('ok', 'running');
    });

    it('путь с пробелами, скобками и & передаётся как есть', async () => {
        const filePath = 'C:\\Users\\Ann (Lee) & Co\\AppData\\scripts\\a b.ahk';
        cp.spawn.mockReturnValue(new Child());
        registry.files.set('odd', filePath);

        await processes.run('odd');

        expect(cp.spawn).toHaveBeenCalledWith(ahk, ['/CP65001', filePath], { windowsHide: false });
        expect(registry.status.set).not.toHaveBeenCalledWith('odd', 'error', expect.anything());
    });

    it('повтор молча, пока процесс жив', async () => {
        cp.spawn.mockReturnValue(new Child());
        registry.files.set('ok', 'C:\\v\\ok.ahk');

        await processes.run('ok');
        await processes.run('ok');

        expect(cp.spawn).toHaveBeenCalledTimes(1);
    });

    it('pending-guard: параллельные run одного id дают один процесс', async () => {
        cp.spawn.mockReturnValue(new Child());
        registry.files.set('ok', 'C:\\v\\ok.ahk');

        await Promise.all([processes.run('ok'), processes.run('ok'), processes.run('ok')]);

        expect(cp.spawn).toHaveBeenCalledTimes(1);
        expect(regQueries()).toHaveLength(3);
    });

    it('pending-guard снимается после ошибки поиска', async () => {
        disk.files.clear();
        registry.files.set('ok', 'C:\\v\\ok.ahk');
        cp.spawn.mockReturnValue(new Child());
        await processes.run('ok');
        disk.files.add(ahk);

        await processes.run('ok');

        expect(cp.spawn).toHaveBeenCalledTimes(1);
    });

    it('remove во время поиска отменяет запуск', async () => {
        cp.spawn.mockReturnValue(new Child());
        registry.files.set('ok', 'C:\\v\\ok.ahk');

        const running = processes.run('ok');
        processes.remove('ok');
        await running;

        expect(cp.spawn).not.toHaveBeenCalled();
        expect(registry.status.set).not.toHaveBeenCalledWith('ok', 'running');
    });

    it('clear во время поиска отменяет запуск', async () => {
        cp.spawn.mockReturnValue(new Child());
        registry.files.set('ok', 'C:\\v\\ok.ahk');

        const running = processes.run('ok');
        await processes.clear();
        await running;

        expect(cp.spawn).not.toHaveBeenCalled();
    });

    it('параллельные run разных id делят один поиск', async () => {
        cp.spawn.mockImplementation(() => new Child());
        registry.files.set('a', 'C:\\v\\a.ahk');
        registry.files.set('b', 'C:\\v\\b.ahk');

        await Promise.all([processes.run('a'), processes.run('b')]);

        expect(cp.spawn).toHaveBeenCalledTimes(2);
        expect(regQueries()).toHaveLength(3);
    });

    it('exit с кодом - error', async () => {
        const child = new Child();
        cp.spawn.mockReturnValue(child);
        registry.files.set('ok', 'C:\\v\\ok.ahk');
        await processes.run('ok');

        child.emit('exit', 3);

        expect(registry.status.set).toHaveBeenLastCalledWith('ok', 'error', 'Exited with code 3');
    });

    it('exit по сигналу (null) - idle', async () => {
        const child = new Child();
        cp.spawn.mockReturnValue(child);
        registry.files.set('ok', 'C:\\v\\ok.ahk');
        await processes.run('ok');

        child.emit('exit', null);

        expect(registry.status.set).toHaveBeenLastCalledWith('ok', 'idle', undefined);
    });

    it('error процесса - статус error с причиной', async () => {
        const child = new Child();
        cp.spawn.mockReturnValue(child);
        registry.files.set('ok', 'C:\\v\\ok.ahk');
        await processes.run('ok');

        child.emit('error', new Error('spawn EACCES'));

        expect(registry.status.set).toHaveBeenLastCalledWith('ok', 'error', expect.stringContaining('EACCES'));
    });

    it('после exit повторный запуск разрешён', async () => {
        const child = new Child();
        cp.spawn.mockReturnValue(child);
        registry.files.set('ok', 'C:\\v\\ok.ahk');
        await processes.run('ok');
        child.emit('exit', 1);

        await processes.run('ok');

        expect(cp.spawn).toHaveBeenCalledTimes(2);
    });

    it('remove своего процесса снимает слушатели и ставит idle', async () => {
        const child = new Child();
        cp.spawn.mockReturnValue(child);
        registry.files.set('own', 'C:\\v\\own.ahk');
        await processes.run('own');
        registry.status.set.mockClear();

        processes.remove('own');

        expect(child.listenerCount('exit')).toBe(0);
        expect(registry.status.set).toHaveBeenCalledWith('own', 'idle');
    });
});

describe('processes: Reload и опрос ОС', () => {
    const filePath = 'C:\\v\\a.ahk';
    let child: Child;

    beforeEach(async () => {
        system.registry.set(HKLM, regOut(AHK_DIR, '1.1.37.02'));
        disk.files.add(exe(AHK_DIR, 'AutoHotkeyU64.exe'));
        child = new Child();
        cp.spawn.mockReturnValue(child);
        registry.files.set('a', filePath);
        registry.known.mockReturnValue(new Map([['a', filePath]]));
        registry.status.get.mockReturnValue('running');
        await processes.run('a');
        registry.status.set.mockClear();
    });

    it('Reload: exit 0, новый экземпляр жив - running', async () => {
        system.ps.mockResolvedValue(commandLine(filePath));

        child.emit('exit', 0);

        await vi.waitFor(() => expect(registry.status.set).toHaveBeenCalledWith('a', 'running'));
        expect(registry.status.set).not.toHaveBeenCalledWith('a', 'idle');
    });

    it('exit 0, скрипта в ОС нет - idle', async () => {
        system.ps.mockResolvedValue(commandLine('C:\\v\\other.ahk'));

        child.emit('exit', 0);

        await vi.waitFor(() => expect(registry.status.set).toHaveBeenCalledWith('a', 'idle'));
        expect(registry.status.set).not.toHaveBeenCalledWith('a', 'running');
    });

    it('путь в ОС сверяется без учёта регистра', async () => {
        system.ps.mockResolvedValue(commandLine('C:\\V\\A.AHK'));

        child.emit('exit', 0);

        await vi.waitFor(() => expect(registry.status.set).toHaveBeenCalledWith('a', 'running'));
    });

    it('пока идёт probe после exit 0, статус не меняется', async () => {
        const pause = deferred<string>();
        system.ps.mockReturnValueOnce(pause.promise);

        child.emit('exit', 0);

        expect(registry.status.set).not.toHaveBeenCalled();
        pause.resolve('');
        await vi.waitFor(() => expect(registry.status.set).toHaveBeenCalledWith('a', 'idle'));
    });

    it('probe не перебивает статус, если скрипт запущен заново', async () => {
        const pause = deferred<string>();
        system.ps.mockReturnValueOnce(pause.promise);
        child.emit('exit', 0);
        cp.spawn.mockReturnValue(new Child());
        await processes.run('a');
        registry.status.set.mockClear();

        pause.resolve('');
        await flush();

        expect(registry.status.set).not.toHaveBeenCalled();
    });

    it('probe не трогает статус, который уже не running', async () => {
        const pause = deferred<string>();
        system.ps.mockReturnValueOnce(pause.promise);
        child.emit('exit', 0);
        registry.status.get.mockReturnValue('idle');

        pause.resolve(commandLine(filePath));
        await flush();

        expect(registry.status.set).not.toHaveBeenCalled();
    });

    it('опрос, начатый до exit, не возвращает мёртвый pid после drop', async () => {
        const stale = deferred<string>();
        system.ps.mockReturnValueOnce(stale.promise);
        const probing = processes.probe();

        child.emit('exit', 3);
        stale.resolve(commandLine(filePath));
        const alive = await probing;

        expect(system.ps).toHaveBeenCalledTimes(2);
        expect(registry.status.set).not.toHaveBeenCalledWith('a', 'running');
        expect(registry.status.set).toHaveBeenCalledWith('a', 'idle');
        expect(alive).toBe(false);
    });

    it('опрос устаревает дважды - probe ничего не меняет и не кеширует', async () => {
        const first = deferred<string>();
        const second = deferred<string>();
        system.ps.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        const pending = processes.probe();
        processes.remove('a');
        first.resolve(commandLine(filePath));
        await flush();
        processes.remove('a');
        registry.status.set.mockClear();

        second.resolve(commandLine(filePath));
        const alive = await pending;
        await processes.probe();

        expect(registry.status.set).not.toHaveBeenCalledWith('a', 'running');
        expect(alive).toBe(false);
        expect(system.ps).toHaveBeenCalledTimes(3);
    });

    it('probe без устаревания: живой скрипт - running, мёртвый - idle', async () => {
        registry.status.get.mockReturnValue('idle');
        system.ps.mockResolvedValue(commandLine(filePath));

        await processes.probe();

        expect(registry.status.set).toHaveBeenCalledWith('a', 'running');
    });
});
