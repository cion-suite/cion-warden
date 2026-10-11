import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cp = vi.hoisted(() => ({ spawn: vi.fn(), spawnSync: vi.fn(), execFile: vi.fn() }));
const registry = vi.hoisted(() => ({
    files: new Map<string, string>(),
    path: vi.fn(),
    status: { set: vi.fn(), get: vi.fn() },
    running: vi.fn(),
    known: vi.fn(),
}));

vi.mock('node:child_process', () => cp);
vi.mock('@app/scripts', () => ({ scripts: registry }));

import { escapePsLike, processes } from '@app/scripts/processes';

class Child extends EventEmitter {
    pid = 42;
    kill = vi.fn();
}

beforeEach(() => {
    for (const fn of [cp.spawn, cp.spawnSync, cp.execFile, registry.path, registry.status.set, registry.status.get, registry.running, registry.known]) fn.mockReset();
    registry.path.mockImplementation((id: string) => registry.files.get(id));
    registry.running.mockReturnValue([]);
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

describe('processes.run', () => {
    it('метасимвол cmd в пути - статус error, процесс не создан', () => {
        registry.files.set('evil', 'C:\\v\\pwn & calc.exe.ahk');

        processes.run('evil');

        expect(cp.spawn).not.toHaveBeenCalled();
        expect(registry.status.set).toHaveBeenCalledWith('evil', 'error', 'Script path contains unsafe characters');
    });

    it('неизвестный id - not_found', () => {
        registry.path.mockImplementation(() => {
            throw Object.assign(new Error('nope'), { code: 'not_found' });
        });

        expect(() => processes.run('x')).toThrowError(expect.objectContaining({ code: 'not_found' }));
    });

    it('запуск, повтор молча, exit с кодом - error', () => {
        const child = new Child();
        cp.spawn.mockReturnValue(child);
        registry.files.set('ok', 'C:\\v\\ok.ahk');

        processes.run('ok');
        processes.run('ok');

        expect(cp.spawn).toHaveBeenCalledTimes(1);
        expect(cp.spawn).toHaveBeenCalledWith('C:\\v\\ok.ahk', [], { shell: true, windowsHide: false });
        expect(registry.status.set).toHaveBeenCalledWith('ok', 'running');

        child.emit('exit', 3);

        expect(registry.status.set).toHaveBeenLastCalledWith('ok', 'error', 'Exited with code 3');
    });

    it('remove своего процесса снимает слушатели и ставит idle', () => {
        const child = new Child();
        cp.spawn.mockReturnValue(child);
        registry.files.set('own', 'C:\\v\\own.ahk');
        processes.run('own');
        registry.status.set.mockClear();

        processes.remove('own');

        expect(child.listenerCount('exit')).toBe(0);
        expect(registry.status.set).toHaveBeenCalledWith('own', 'idle');
    });
});
