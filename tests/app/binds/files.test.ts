import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const where = vi.hoisted(() => ({ vault: '' }));
const manifest = vi.hoisted(() => ({ read: vi.fn(), get: vi.fn() }));
const metas = vi.hoisted(() => vi.fn());
const github = vi.hoisted(() => ({ file: vi.fn() }));
const store = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn() }));
const events = vi.hoisted(() => ({ emit: vi.fn() }));

vi.mock('@app/utils/paths', () => ({
    paths: {
        source: (id: string) => {
            const base = path.join(where.vault, id);
            return { base, presets: path.join(base, 'presets'), versions: path.join(base, '.versions.json') };
        },
    },
}));
vi.mock('@app/catalog', async (importOriginal) => {
    const original = await importOriginal<typeof import('@app/catalog')>();
    return { catalog: { ...original.catalog, manifest, metas } };
});
vi.mock('@app/github', () => ({ github }));
vi.mock('@app/sources/store', () => ({ store }));
vi.mock('@cion-suite/core', async (importOriginal) => {
    const original = await importOriginal<typeof import('@cion-suite/core')>();
    return { ...original, events };
});

import { catalog } from '@app/catalog';
import { binds } from '@app/binds/files';
import { fsx } from '@app/utils/fsx';

const source = { id: 's1', type: 'git', name: 'o/r', url: 'https://github.com/o/r', branch: 'main', isPrivate: false };
const text = (repoPath: string) => `jump = F1 ; ${repoPath}\r\n`;
const body = (repoPath: string) => Buffer.from(text(repoPath));
const entry = (fileName: string) => ({ fileName, sha: 'x', downloadUrl: null });
const id = (fileName: string) => `s1:preset:${fileName}`;
const presets = () => path.join(where.vault, 's1', 'presets');
const read = (file: string) => fs.readFile(path.join(presets(), file), 'utf8');

beforeEach(async () => {
    where.vault = await fs.mkdtemp(path.join(os.tmpdir(), 'warden-binds-'));
    store.get.mockReset().mockResolvedValue(source);
    store.list.mockReset().mockResolvedValue([source]);
    manifest.read.mockReset().mockResolvedValue({ presets: [entry('a.ahk'), entry('b.ahk')] });
    manifest.get.mockReset().mockResolvedValue({ presets: [entry('a.ahk'), entry('b.ahk')] });
    metas.mockReset().mockResolvedValue({ presets: [] });
    github.file.mockReset().mockImplementation(async (_source: unknown, repoPath: string) => body(repoPath));
    events.emit.mockReset();
});

afterEach(async () => {
    await fs.rm(where.vault, { recursive: true, force: true });
});

describe('binds.install', () => {
    it('пишет файл и эмитит bind:changed', async () => {
        await binds.install('s1', id('a.ahk'));

        expect(github.file).toHaveBeenCalledWith(source, 'presets/a.ahk');
        expect(await read('a.ahk')).toBe(text('presets/a.ahk'));
        expect(events.emit).toHaveBeenCalledWith('bind:changed', { sourceId: 's1', presetId: id('a.ahk') });
    });

    it('нет пресета в manifest - not_found', async () => {
        await expect(binds.install('s1', id('zzz.ahk'))).rejects.toMatchObject({ code: 'not_found' });
        expect(events.emit).not.toHaveBeenCalled();
    });

    it('пишет версию: ключ presets/<файл>, значение sha скачанных байт', async () => {
        await binds.install('s1', id('a.ahk'));

        await expect(catalog.versions.read('s1')).resolves.toEqual({
            'presets/a.ahk': fsx.sha(body('presets/a.ahk')),
        });
    });

    it('поверх файла с правкой переносит значение, версия - sha репо-байт', async () => {
        await binds.install('s1', id('a.ahk'));
        await fs.writeFile(path.join(presets(), 'a.ahk'), 'jump = F9 ; presets/a.ahk\r\n');
        const update = Buffer.from('jump = F1 ; new\r\nspeed = 5\r\n');
        github.file.mockResolvedValue(update);

        await binds.install('s1', id('a.ahk'));

        expect(await read('a.ahk')).toBe('jump = F9 ; new\r\nspeed = 5\r\n');
        await expect(catalog.versions.read('s1')).resolves.toEqual({ 'presets/a.ahk': fsx.sha(update) });
    });

    it('сбой скачивания - версия не записана, события нет', async () => {
        const record = vi.spyOn(catalog.versions, 'record');
        github.file.mockRejectedValue(new Error('down'));

        await expect(binds.install('s1', id('a.ahk'))).rejects.toThrow('down');

        expect(record).not.toHaveBeenCalled();
        await expect(catalog.versions.read('s1')).resolves.toEqual({});
        expect(events.emit).not.toHaveBeenCalled();
        record.mockRestore();
    });

    it('сбой записи файла - версия не записана', async () => {
        const record = vi.spyOn(catalog.versions, 'record');
        await fs.mkdir(path.join(where.vault, 's1'), { recursive: true });
        await fs.writeFile(presets(), 'not a directory');

        await expect(binds.install('s1', id('a.ahk'))).rejects.toMatchObject({ code: 'failed' });

        expect(record).not.toHaveBeenCalled();
        await expect(catalog.versions.read('s1')).resolves.toEqual({});
        record.mockRestore();
    });
});

describe('binds.sync', () => {
    it('актуальные пропускает, сбой считает в failed', async () => {
        metas.mockResolvedValue({ presets: [{ id: id('a.ahk'), isDownloaded: true, hasUpdate: false }] });

        await expect(binds.sync('s1')).resolves.toEqual({ ok: 1, failed: 0 });
        expect(github.file).toHaveBeenCalledTimes(1);
        expect(events.emit).toHaveBeenCalledWith('bind:changed', { sourceId: 's1', presetId: '*' });

        metas.mockResolvedValue({ presets: [] });
        github.file.mockRejectedValue(new Error('down'));

        await expect(binds.sync()).resolves.toEqual({ ok: 0, failed: 2 });
    });

    it('актуальный не перекачивает: правка цела, качает остальные с версией', async () => {
        await binds.install('s1', id('a.ahk'));
        await fs.writeFile(path.join(presets(), 'a.ahk'), 'jump = F9\r\n');
        github.file.mockClear();
        metas.mockResolvedValue({ presets: [{ id: id('a.ahk'), isDownloaded: true, hasUpdate: false }] });

        await expect(binds.sync('s1')).resolves.toEqual({ ok: 1, failed: 0 });

        expect(await read('a.ahk')).toBe('jump = F9\r\n');
        expect(github.file).toHaveBeenCalledTimes(1);
        expect(github.file).toHaveBeenCalledWith(source, 'presets/b.ahk');
        await expect(catalog.versions.read('s1')).resolves.toEqual({
            'presets/a.ahk': fsx.sha(body('presets/a.ahk')),
            'presets/b.ahk': fsx.sha(body('presets/b.ahk')),
        });
    });

    it('с обновлением перекачивает и переносит значения, сбой одного не мешает другому', async () => {
        await binds.install('s1', id('a.ahk'));
        await fs.writeFile(path.join(presets(), 'a.ahk'), 'jump = F9 ; presets/a.ahk\r\n');
        metas.mockResolvedValue({ presets: [{ id: id('a.ahk'), isDownloaded: true, hasUpdate: true }] });
        const update = Buffer.from('jump = F1 ; new\r\n');
        github.file.mockImplementation(async (_source: unknown, repoPath: string) => {
            if (repoPath.endsWith('b.ahk')) throw new Error('down');
            return update;
        });

        await expect(binds.sync('s1')).resolves.toEqual({ ok: 1, failed: 1 });

        expect(await read('a.ahk')).toBe('jump = F9 ; new\r\n');
        await expect(catalog.versions.read('s1')).resolves.toEqual({ 'presets/a.ahk': fsx.sha(update) });
    });

    it('источник без manifest - нули', async () => {
        manifest.read.mockResolvedValue(null);

        await expect(binds.sync('s1')).resolves.toEqual({ ok: 0, failed: 0 });
    });

    it('неизвестный источник - not_found', async () => {
        store.get.mockRejectedValue(Object.assign(new Error('x'), { code: 'not_found' }));

        await expect(binds.sync('nope')).rejects.toMatchObject({ code: 'not_found' });
    });
});

describe('binds.remove', () => {
    it('удаляет рабочий файл, старый values.json не трогает', async () => {
        await binds.install('s1', id('a.ahk'));
        await fs.writeFile(path.join(presets(), 'a.values.json'), '{}');

        await binds.remove('s1', id('a.ahk'));

        expect(await fs.readdir(presets())).toEqual(['a.values.json']);
        expect(events.emit).toHaveBeenLastCalledWith('bind:changed', { sourceId: 's1', presetId: id('a.ahk') });
    });

    it('не скачанный пресет - без ошибки', async () => {
        await expect(binds.remove('s1', id('a.ahk'))).resolves.toBeUndefined();
    });
});

describe('binds.schema', () => {
    it('нет manifest, пресета или файла - null', async () => {
        manifest.read.mockResolvedValueOnce(null);
        await expect(binds.schema('s1', id('a.ahk'))).resolves.toBeNull();
        await expect(binds.schema('s1', id('zzz.ahk'))).resolves.toBeNull();
        await expect(binds.schema('s1', id('a.ahk'))).resolves.toBeNull();
    });

    it('читает схему и значения из скачанного файла', async () => {
        await binds.install('s1', id('a.ahk'));

        await expect(binds.schema('s1', id('a.ahk'))).resolves.toEqual({
            sections: [{
                title: '',
                fields: [{ key: 'jump', label: 'presets/a.ahk', type: 'hotkey', value: 'F1' }],
            }],
        });
    });

    it('прочая ошибка чтения - failed, не null', async () => {
        await fs.mkdir(path.join(presets(), 'a.ahk'), { recursive: true });

        await expect(binds.schema('s1', id('a.ahk'))).rejects.toMatchObject({ code: 'failed' });
    });
});

describe('binds.values', () => {
    it('save пишет значение прямо в .ahk, незнакомые ключи игнорирует', async () => {
        await binds.install('s1', id('a.ahk'));

        await binds.values.save('s1', id('a.ahk'), { jump: 'F9', unknown: 1 });

        expect(await read('a.ahk')).toBe('jump = F9 ; presets/a.ahk\r\n');
        expect(await binds.schema('s1', id('a.ahk'))).toMatchObject({
            sections: [{ fields: [{ key: 'jump', value: 'F9' }] }],
        });
    });

    it('save без скачанного файла - not_found, файл не создан', async () => {
        await expect(binds.values.save('s1', id('a.ahk'), { jump: 'F9' })).rejects.toMatchObject({ code: 'not_found' });
        await expect(fs.access(path.join(presets(), 'a.ahk'))).rejects.toBeDefined();
    });

    it('save нет пресета в manifest - not_found', async () => {
        await expect(binds.values.save('s1', id('zzz.ahk'), { jump: 'F9' })).rejects.toMatchObject({ code: 'not_found' });
    });
});

describe('binds.local', () => {
    it('файл не скачан - not_found', async () => {
        await expect(binds.local('s1', id('a.ahk'))).rejects.toMatchObject({ code: 'not_found' });
        await binds.install('s1', id('a.ahk'));
        await expect(binds.local('s1', id('a.ahk'))).resolves.toBe(path.join(presets(), 'a.ahk'));
    });
});
