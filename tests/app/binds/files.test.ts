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
const body = (repoPath: string) => Buffer.from(`{"title":"${repoPath}"}`);
const entry = (fileName: string) => ({ fileName, sha: 'x', downloadUrl: null });
const id = (fileName: string) => `s1:preset:${fileName}`;
const presets = () => path.join(where.vault, 's1', 'presets');
const saved = async (file: string) => JSON.parse(await fs.readFile(path.join(presets(), file), 'utf8')) as unknown;

beforeEach(async () => {
    where.vault = await fs.mkdtemp(path.join(os.tmpdir(), 'warden-binds-'));
    store.get.mockReset().mockResolvedValue(source);
    store.list.mockReset().mockResolvedValue([source]);
    manifest.read.mockReset().mockResolvedValue({ presets: [entry('a.json'), entry('b.json')] });
    manifest.get.mockReset().mockResolvedValue({ presets: [entry('a.json'), entry('b.json')] });
    metas.mockReset().mockResolvedValue({ presets: [] });
    github.file.mockReset().mockImplementation(async (_source: unknown, repoPath: string) => body(repoPath));
    events.emit.mockReset();
});

afterEach(async () => {
    await fs.rm(where.vault, { recursive: true, force: true });
});

describe('binds.install', () => {
    it('пишет файл и эмитит bind:changed', async () => {
        await binds.install('s1', id('a.json'));

        expect(github.file).toHaveBeenCalledWith(source, 'presets/a.json');
        expect(await saved('a.json')).toEqual({ title: 'presets/a.json' });
        expect(events.emit).toHaveBeenCalledWith('bind:changed', { sourceId: 's1', presetId: id('a.json') });
    });

    it('нет пресета в manifest - not_found', async () => {
        await expect(binds.install('s1', id('zzz.json'))).rejects.toMatchObject({ code: 'not_found' });
        expect(events.emit).not.toHaveBeenCalled();
    });

    it('пишет версию: ключ presets/<файл>, значение sha скачанных байт', async () => {
        await binds.install('s1', id('a.json'));

        await expect(catalog.versions.read('s1')).resolves.toEqual({
            'presets/a.json': fsx.sha(body('presets/a.json')),
        });
    });

    it('сбой скачивания - версия не записана, события нет', async () => {
        const record = vi.spyOn(catalog.versions, 'record');
        github.file.mockRejectedValue(new Error('down'));

        await expect(binds.install('s1', id('a.json'))).rejects.toThrow('down');

        expect(record).not.toHaveBeenCalled();
        await expect(catalog.versions.read('s1')).resolves.toEqual({});
        expect(events.emit).not.toHaveBeenCalled();
        record.mockRestore();
    });

    it('сбой записи файла - версия не записана', async () => {
        const record = vi.spyOn(catalog.versions, 'record');
        await fs.mkdir(path.join(where.vault, 's1'), { recursive: true });
        await fs.writeFile(presets(), 'not a directory');

        await expect(binds.install('s1', id('a.json'))).rejects.toMatchObject({ code: 'failed' });

        expect(record).not.toHaveBeenCalled();
        await expect(catalog.versions.read('s1')).resolves.toEqual({});
        record.mockRestore();
    });
});

describe('binds.sync', () => {
    it('актуальные пропускает, сбой считает в failed', async () => {
        metas.mockResolvedValue({ presets: [{ id: id('a.json'), isDownloaded: true, hasUpdate: false }] });

        await expect(binds.sync('s1')).resolves.toEqual({ ok: 1, failed: 0 });
        expect(github.file).toHaveBeenCalledTimes(1);
        expect(events.emit).toHaveBeenCalledWith('bind:changed', { sourceId: 's1', presetId: '*' });

        metas.mockResolvedValue({ presets: [] });
        github.file.mockRejectedValue(new Error('down'));

        await expect(binds.sync()).resolves.toEqual({ ok: 0, failed: 2 });
    });

    it('актуальный не перекачивает: правка цела, качает остальные с версией', async () => {
        await binds.install('s1', id('a.json'));
        await fs.writeFile(path.join(presets(), 'a.json'), '{"user":"edit"}');
        github.file.mockClear();
        metas.mockResolvedValue({ presets: [{ id: id('a.json'), isDownloaded: true, hasUpdate: false }] });

        await expect(binds.sync('s1')).resolves.toEqual({ ok: 1, failed: 0 });

        expect(await saved('a.json')).toEqual({ user: 'edit' });
        expect(github.file).toHaveBeenCalledTimes(1);
        expect(github.file).toHaveBeenCalledWith(source, 'presets/b.json');
        await expect(catalog.versions.read('s1')).resolves.toEqual({
            'presets/a.json': fsx.sha(body('presets/a.json')),
            'presets/b.json': fsx.sha(body('presets/b.json')),
        });
    });

    it('с обновлением перекачивает, сбой одного не мешает другому', async () => {
        await binds.install('s1', id('a.json'));
        await fs.writeFile(path.join(presets(), 'a.json'), '{"user":"edit"}');
        metas.mockResolvedValue({ presets: [{ id: id('a.json'), isDownloaded: true, hasUpdate: true }] });
        github.file.mockImplementation(async (_source: unknown, repoPath: string) => {
            if (repoPath.endsWith('b.json')) throw new Error('down');
            return body(repoPath);
        });

        await expect(binds.sync('s1')).resolves.toEqual({ ok: 1, failed: 1 });

        expect(await saved('a.json')).toEqual({ title: 'presets/a.json' });
        await expect(catalog.versions.read('s1')).resolves.toEqual({
            'presets/a.json': fsx.sha(body('presets/a.json')),
        });
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
    it('удаляет схему и значения', async () => {
        await binds.install('s1', id('a.json'));
        await fs.writeFile(path.join(presets(), 'a.values.json'), '{}');

        await binds.remove('s1', id('a.json'));

        expect(await fs.readdir(presets())).toEqual([]);
        expect(events.emit).toHaveBeenLastCalledWith('bind:changed', { sourceId: 's1', presetId: id('a.json') });
    });
});

describe('binds.schema и values', () => {
    it('нет manifest, пресета или файла - null и пустые значения', async () => {
        manifest.read.mockResolvedValueOnce(null);
        await expect(binds.schema('s1', id('a.json'))).resolves.toBeNull();
        await expect(binds.schema('s1', id('zzz.json'))).resolves.toBeNull();
        await expect(binds.schema('s1', id('a.json'))).resolves.toBeNull();
        await expect(binds.values.get('s1', id('a.json'))).resolves.toEqual({});
    });

    it('битый файл схемы - null, не throw', async () => {
        await fs.mkdir(presets(), { recursive: true });
        await fs.writeFile(path.join(presets(), 'a.json'), '{oops');

        await expect(binds.schema('s1', id('a.json'))).resolves.toBeNull();
    });

    it('save пишет вложенные значения, get читает плоские', async () => {
        await binds.install('s1', id('a.json'));

        await binds.values.save('s1', id('a.json'), { 'misc.fps': 144, 'game.shoot': 'F9' });

        expect(await saved('a.values.json')).toEqual({ misc: { fps: 144 }, game: { shoot: 'F9' } });
        await expect(binds.values.get('s1', id('a.json'))).resolves.toEqual({ 'misc.fps': 144, 'game.shoot': 'F9' });
        expect(await binds.schema('s1', id('a.json'))).toMatchObject({ title: 'a' });
    });

    it('save без скачанной схемы - not_found, файл значений не создан', async () => {
        await expect(binds.values.save('s1', id('a.json'), { 'a.b': 1 })).rejects.toMatchObject({ code: 'not_found' });
        await expect(fs.access(path.join(presets(), 'a.values.json'))).rejects.toBeDefined();
    });

    it('reset удаляет значения; нет пресета - молча', async () => {
        await binds.install('s1', id('a.json'));
        await binds.values.save('s1', id('a.json'), { 'a.b': 1 });

        await binds.values.reset('s1', id('a.json'));
        await binds.values.reset('s1', id('zzz.json'));

        expect(await fs.readdir(presets())).toEqual(['a.json']);
    });
});

describe('binds.local', () => {
    it('схема не скачана - not_found', async () => {
        await expect(binds.local('s1', id('a.json'))).rejects.toMatchObject({ code: 'not_found' });
        await binds.install('s1', id('a.json'));
        await expect(binds.local('s1', id('a.json'))).resolves.toBe(path.join(presets(), 'a.json'));
    });
});
