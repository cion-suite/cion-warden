import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cp = vi.hoisted(() => ({ spawnSync: vi.fn(), spawn: vi.fn() }));

vi.mock('node:child_process', () => cp);

import { registry } from '@app/fonts/registry';

const KEY = 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts';

beforeEach(() => {
    cp.spawnSync.mockReset();
    cp.spawn.mockReset();
});

describe('registry.name', () => {
    it('id источника (8 символов) и вид шрифта в имени значения', () => {
        expect(registry.name('abcdef1234567890', 'Fancy', 'a.ttf')).toBe('[abcdef12] Fancy (TrueType)');
        expect(registry.name('abcdef1234567890', 'Fancy', 'a.OTF')).toBe('[abcdef12] Fancy (OpenType)');
        expect(registry.name('abc', 'Fancy', 'a.ttc')).toBe('[abc] Fancy (TrueType)');
    });
});

describe('registry.add / delete', () => {
    it('add: reg.exe с ключом HKCU пользователя, значением REG_SZ и force', () => {
        cp.spawnSync.mockReturnValue({ status: 0, stderr: '' });

        expect(registry.add('[a] Fancy (TrueType)', 'C:\\Fonts\\a__x.ttf')).toEqual({ ok: true, stderr: '' });

        expect(cp.spawnSync).toHaveBeenCalledWith(
            'reg.exe',
            ['add', KEY, '/v', '[a] Fancy (TrueType)', '/t', 'REG_SZ', '/d', 'C:\\Fonts\\a__x.ttf', '/f'],
            { encoding: 'utf-8' },
        );
    });

    it('add: ненулевой код - ok false и stderr', () => {
        cp.spawnSync.mockReturnValue({ status: 1, stderr: 'denied' });

        expect(registry.add('n', 'p')).toEqual({ ok: false, stderr: 'denied' });
    });

    it('delete: reg.exe delete того же ключа', () => {
        registry.delete('[a] Fancy (TrueType)');

        expect(cp.spawnSync).toHaveBeenCalledWith(
            'reg.exe',
            ['delete', KEY, '/v', '[a] Fancy (TrueType)', '/f'],
            { stdio: 'ignore' },
        );
    });
});

describe('registry.script', () => {
    it('пути в одинарных кавычках, кавычка в пути удваивается', () => {
        const text = registry.script(["C:\\Fonts\\it's.ttf"], ['C:\\Fonts\\old.ttf']);

        expect(text).toContain("  'C:\\Fonts\\it''s.ttf'");
        expect(text).toContain("  'C:\\Fonts\\old.ttf'");
        expect(text).toContain('AddFontResourceW($p)');
        expect(text).toContain('RemoveFontResourceW($p)');
        expect(text).toContain('SendMessageTimeoutA(-1, 29,');
    });

    it('несколько путей - через запятую и перенос', () => {
        expect(registry.script(['a', 'b'], [])).toContain("$loads = @(\n  'a',\n  'b'\n)");
    });
});

describe('registry.broadcast', () => {
    it('нечего слать - процесс не запускается', async () => {
        await expect(registry.broadcast([], [])).resolves.toBeUndefined();

        expect(cp.spawn).not.toHaveBeenCalled();
    });

    it('ждёт выхода powershell без профиля и окна', async () => {
        const child = new EventEmitter();
        cp.spawn.mockReturnValue(child);

        const done = registry.broadcast(['a'], []);
        child.emit('exit');
        await done;

        expect(cp.spawn).toHaveBeenCalledWith(
            'powershell',
            expect.arrayContaining(['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command']),
            { stdio: 'ignore', windowsHide: true },
        );
    });

    it('сбой запуска powershell не бросает', async () => {
        const child = new EventEmitter();
        cp.spawn.mockReturnValue(child);

        const done = registry.broadcast([], ['a']);
        child.emit('error', new Error('ENOENT'));

        await expect(done).resolves.toBeUndefined();
    });
});
