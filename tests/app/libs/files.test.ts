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
        source: (id: string) => ({
            lib: path.join(where.vault, id, 'lib'),
            versions: path.join(where.vault, id, '.versions.json'),
        }),
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
import { libs } from '@app/libs/files';
import { fsx } from '@app/utils/fsx';

const source = { id: 's1', type: 'git', name: 'o/r', url: 'https://github.com/o/r', branch: 'main', isPrivate: false };
const file = (p: string) => ({ path: p, sha: 'x', downloadUrl: null });
const single = { name: 'a', kind: 'file', path: 'a.ahk', sha: 'x', webUrl: 'https://github.com/o/r/blob/main/lib/a.ahk', files: [file('a.ahk')] };
const folder = { name: 'dir', kind: 'folder', path: 'dir', sha: 'x', files: [file('dir/one.ahk'), file('dir/two.ahk')] };
const mixed = { name: 'mixed', kind: 'folder', path: 'mixed', sha: 'x', files: [file('mixed/ok.ahk'), file('../../x.ahk')] };
const evil = { name: 'evil', kind: 'file', path: '../../x.ahk', sha: 'x', files: [file('../../x.ahk')] };
const body = (repoPath: string) => Buffer.from(`body:${repoPath}`);
const lib = () => path.join(where.vault, 's1', 'lib');

beforeEach(async () => {
    where.vault = await fs.mkdtemp(path.join(os.tmpdir(), 'warden-libs-'));
    const data = { libs: [single, folder, evil, mixed] };
    store.get.mockReset().mockResolvedValue(source);
    store.list.mockReset().mockResolvedValue([source]);
    manifest.read.mockReset().mockResolvedValue(data);
    manifest.get.mockReset().mockResolvedValue(data);
    metas.mockReset().mockResolvedValue({ libs: [] });
    github.file.mockReset().mockImplementation(async (_source: unknown, repoPath: string) => body(repoPath));
    events.emit.mockReset();
});

afterEach(async () => {
    await fs.rm(where.vault, { recursive: true, force: true });
});

describe('libs.install', () => {
    it('lib-папка: все файлы и событие', async () => {
        await libs.install('s1', 's1:lib:dir');

        expect(await fs.readdir(path.join(lib(), 'dir'))).toEqual(['one.ahk', 'two.ahk']);
        expect(github.file).toHaveBeenCalledWith(source, 'lib/dir/one.ahk');
        expect(events.emit).toHaveBeenCalledWith('lib:changed', { sourceId: 's1', libId: 's1:lib:dir' });
    });

    it('путь за пределы lib - validation, ничего не записано', async () => {
        await expect(libs.install('s1', 's1:lib:evil')).rejects.toMatchObject({ code: 'validation' });
        await expect(fs.access(path.join(where.vault, 'x.ahk'))).rejects.toBeDefined();
        expect(events.emit).not.toHaveBeenCalled();
    });

    it('пишет версию каждого файла: ключ lib/<путь>, значение sha скачанных байт', async () => {
        await libs.install('s1', 's1:lib:dir');

        await expect(catalog.versions.read('s1')).resolves.toEqual({
            'lib/dir/one.ahk': fsx.sha(body('lib/dir/one.ahk')),
            'lib/dir/two.ahk': fsx.sha(body('lib/dir/two.ahk')),
        });
    });

    it('сбой скачивания второго файла - версии не записаны вовсе', async () => {
        const record = vi.spyOn(catalog.versions, 'record');
        github.file.mockImplementation(async (_source: unknown, repoPath: string) => {
            if (repoPath.endsWith('two.ahk')) throw new Error('down');
            return body(repoPath);
        });

        await expect(libs.install('s1', 's1:lib:dir')).rejects.toThrow('down');

        expect(record).not.toHaveBeenCalled();
        await expect(catalog.versions.read('s1')).resolves.toEqual({});
        expect(events.emit).not.toHaveBeenCalled();
        record.mockRestore();
    });

    it('сбой записи второго файла - версии не записаны вовсе', async () => {
        const record = vi.spyOn(catalog.versions, 'record');

        await expect(libs.install('s1', 's1:lib:mixed')).rejects.toMatchObject({ code: 'validation' });

        expect(record).not.toHaveBeenCalled();
        await expect(catalog.versions.read('s1')).resolves.toEqual({});
        record.mockRestore();
    });

    it('нет lib - not_found', async () => {
        await expect(libs.install('s1', 's1:lib:zzz')).rejects.toMatchObject({ code: 'not_found' });
    });
});

describe('libs.sync', () => {
    it('считает ok и failed, эмитит * на источник', async () => {
        github.file.mockImplementation(async (_source: unknown, repoPath: string) => {
            if (repoPath.startsWith('lib/dir')) throw new Error('down');
            return body(repoPath);
        });

        await expect(libs.sync('s1')).resolves.toEqual({ ok: 1, failed: 3 });
        expect(events.emit).toHaveBeenCalledWith('lib:changed', { sourceId: 's1', libId: '*' });
        await expect(catalog.versions.read('s1')).resolves.toEqual({ 'lib/a.ahk': fsx.sha(body('lib/a.ahk')) });
    });

    it('актуальную lib не перекачивает: правка пользователя цела, версия не тронута', async () => {
        manifest.read.mockResolvedValue({ libs: [single, folder] });
        await libs.install('s1', 's1:lib:a');
        await fs.writeFile(path.join(lib(), 'a.ahk'), 'user edit');
        github.file.mockClear();
        metas.mockResolvedValue({ libs: [{ id: 's1:lib:a', isDownloaded: true, hasUpdate: false }] });

        await expect(libs.sync('s1')).resolves.toEqual({ ok: 1, failed: 0 });

        expect(await fs.readFile(path.join(lib(), 'a.ahk'), 'utf8')).toBe('user edit');
        expect(github.file).not.toHaveBeenCalledWith(source, 'lib/a.ahk');
        expect(github.file).toHaveBeenCalledWith(source, 'lib/dir/one.ahk');
    });

    it('качает не скачанную и с обновлением, пишет их версии', async () => {
        manifest.read.mockResolvedValue({ libs: [single, folder] });
        metas.mockResolvedValue({ libs: [{ id: 's1:lib:dir', isDownloaded: true, hasUpdate: true }] });

        await expect(libs.sync('s1')).resolves.toEqual({ ok: 2, failed: 0 });

        expect(await fs.readFile(path.join(lib(), 'a.ahk'), 'utf8')).toBe('body:lib/a.ahk');
        expect(await fs.readdir(path.join(lib(), 'dir'))).toEqual(['one.ahk', 'two.ahk']);
        await expect(catalog.versions.read('s1')).resolves.toEqual({
            'lib/a.ahk': fsx.sha(body('lib/a.ahk')),
            'lib/dir/one.ahk': fsx.sha(body('lib/dir/one.ahk')),
            'lib/dir/two.ahk': fsx.sha(body('lib/dir/two.ahk')),
        });
    });

    it('сбой одной lib не мешает остальным', async () => {
        manifest.read.mockResolvedValue({ libs: [folder, single] });
        github.file.mockImplementation(async (_source: unknown, repoPath: string) => {
            if (repoPath.startsWith('lib/dir')) throw new Error('down');
            return body(repoPath);
        });

        await expect(libs.sync('s1')).resolves.toEqual({ ok: 1, failed: 1 });

        expect(await fs.readdir(lib())).toEqual(['a.ahk']);
    });

    it('без sourceId - все источники; нет manifest - нули', async () => {
        manifest.read.mockResolvedValue(null);

        await expect(libs.sync()).resolves.toEqual({ ok: 0, failed: 0 });
        expect(store.list).toHaveBeenCalledTimes(1);
    });

    it('неизвестный источник - not_found', async () => {
        store.get.mockRejectedValue(Object.assign(new Error('x'), { code: 'not_found' }));

        await expect(libs.sync('nope')).rejects.toMatchObject({ code: 'not_found' });
    });
});

describe('libs.remove', () => {
    it('папка удаляется целиком, файл - по записи', async () => {
        await libs.install('s1', 's1:lib:dir');
        await libs.install('s1', 's1:lib:a');

        await libs.remove('s1', 's1:lib:dir');
        expect(await fs.readdir(lib())).toEqual(['a.ahk']);

        await libs.remove('s1', 's1:lib:a');
        expect(await fs.readdir(lib())).toEqual([]);
    });

    it('путь за пределы lib - validation', async () => {
        await expect(libs.remove('s1', 's1:lib:evil')).rejects.toMatchObject({ code: 'validation' });
    });
});

describe('libs.local и libs.url', () => {
    it('local: нет копии - not_found, есть - путь', async () => {
        await expect(libs.local('s1', 's1:lib:a')).rejects.toMatchObject({ code: 'not_found' });

        await libs.install('s1', 's1:lib:a');

        await expect(libs.local('s1', 's1:lib:a')).resolves.toBe(path.join(lib(), 'a.ahk'));
    });

    it('url: без webUrl - not_found', async () => {
        await expect(libs.url('s1', 's1:lib:a')).resolves.toBe(single.webUrl);
        await expect(libs.url('s1', 's1:lib:dir')).rejects.toMatchObject({ code: 'not_found' });
    });
});
