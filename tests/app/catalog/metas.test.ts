import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const where = vi.hoisted(() => ({ dir: '' }));
const store = vi.hoisted(() => ({ get: vi.fn(), list: vi.fn() }));

vi.mock('@app/sources/store', () => ({ store }));
vi.mock('@app/utils/paths', () => ({
    paths: {
        source: (id: string) => ({
            base: `${where.dir}/${id}`,
            manifest: `${where.dir}/${id}/.manifest.json`,
            cache: `${where.dir}/${id}/.local-cache.json`,
        }),
    },
}));

import { metas } from '@app/catalog/metas';
import { manifest } from '@app/catalog/manifest';
import type { ManifestFile } from '@app/catalog/types';
import { fsx } from '@app/utils/fsx';

const record = (id: string) => ({ id, type: 'git', name: `o/${id}`, url: `https://github.com/o/${id}`, branch: 'main', isPrivate: false });

const content = Buffer.from('hello');
const sha = fsx.sha(content);

const file = (fileName: string, fileSha: string) => ({ fileName, sha: fileSha, downloadUrl: `https://raw/${fileName}` });

const data = (patch: Partial<ManifestFile> = {}): ManifestFile => ({
    version: 4, etag: null, treeSha: null, branch: 'main', lastSyncedAt: 1, lastCheckedAt: 1,
    scripts: [file('a.ahk', sha), file('b.ahk', 'other')],
    cfgs: [],
    libs: [{
        name: 'pack', kind: 'folder', path: 'pack', sha: 'x',
        files: [{ path: 'pack/1.ahk', sha, downloadUrl: null }, { path: 'pack/2.ahk', sha: 'new', downloadUrl: null }],
    }],
    presets: [file('p.json', sha)],
    fonts: [],
    ...patch,
});

beforeEach(async () => {
    where.dir = await fs.mkdtemp(path.join(os.tmpdir(), 'warden-metas-'));
    store.get.mockReset().mockImplementation((id: string) => Promise.resolve(record(id)));
    store.list.mockReset().mockResolvedValue([record('a')]);
});

afterEach(async () => {
    await fs.rm(where.dir, { recursive: true, force: true });
});

async function localFile(sourceId: string, rel: string, body: Buffer): Promise<void> {
    await fsx.write(path.join(where.dir, sourceId, rel), body);
}

describe('metas(sourceId)', () => {
    it('неизвестный источник - not_found', async () => {
        store.get.mockRejectedValue(Object.assign(new Error('Source not found'), { code: 'not_found' }));

        await expect(metas('zzz')).rejects.toThrow('not found');
    });

    it('источник без manifest - пустой каталог', async () => {
        await expect(metas('a')).resolves.toEqual({ scripts: [], libs: [], presets: [] });
    });

    it('локальные файлы: скачано, есть обновление, не скачано', async () => {
        await manifest.write('a', data());
        await localFile('a', 'scripts/a.ahk', content);
        await localFile('a', 'scripts/b.ahk', content);
        await localFile('a', 'lib/pack/1.ahk', content);
        await localFile('a', 'lib/pack/2.ahk', content);

        const result = await metas('a');

        expect(result.scripts).toMatchObject([
            { id: 'a:a.ahk', name: 'a', sourceId: 'a', sourceName: 'o/a', isDownloaded: true, hasUpdate: false, localSha: sha },
            { id: 'a:b.ahk', isDownloaded: true, hasUpdate: true, sha: 'other', localSha: sha },
        ]);
        expect(result.libs).toMatchObject([{ id: 'a:lib:pack', isDownloaded: true, hasUpdate: true }]);
        expect(result.presets).toMatchObject([{ id: 'a:preset:p.json', isDownloaded: false, hasUpdate: false }]);
    });

    it('lib с отсутствующим файлом не скачан и без обновления', async () => {
        await manifest.write('a', data());
        await localFile('a', 'lib/pack/2.ahk', content);

        expect((await metas('a')).libs[0]).toMatchObject({ isDownloaded: false, hasUpdate: false });
    });

    it('lib без файлов не считается скачанной', async () => {
        await manifest.write('a', data({ libs: [{ name: 'empty', kind: 'folder', path: 'empty', sha: '1', files: [] }] }));

        expect((await metas('a')).libs[0]).toMatchObject({ isDownloaded: false, hasUpdate: false });
    });

    it('кеш sha пишется и используется по mtime и size', async () => {
        await manifest.write('a', data());
        await localFile('a', 'scripts/a.ahk', content);
        const cachePath = path.join(where.dir, 'a', '.local-cache.json');

        await metas('a');
        const cache = JSON.parse(await fs.readFile(cachePath, 'utf8')) as Record<string, { sha: string }>;
        expect(cache['scripts/a.ahk']?.sha).toBe(sha);

        // Подмена sha в кеше: файл с тем же mtime не перечитывается
        cache['scripts/a.ahk']!.sha = 'from-cache';
        await fs.writeFile(cachePath, JSON.stringify(cache));
        expect((await metas('a')).scripts[0]).toMatchObject({ localSha: 'from-cache', hasUpdate: true });
    });

    it('битый кеш не ломает список', async () => {
        await manifest.write('a', data());
        await localFile('a', 'scripts/a.ahk', content);
        await fs.writeFile(path.join(where.dir, 'a', '.local-cache.json'), '{oops');

        expect((await metas('a')).scripts[0]).toMatchObject({ localSha: sha });
    });
});

describe('metas()', () => {
    it('объединяет источники, упавший пропускает', async () => {
        store.list.mockResolvedValue([record('a'), record('b'), record('c')]);
        await manifest.write('a', data({ libs: [], presets: [], scripts: [file('one.ahk', '1')] }));
        await manifest.write('c', data({ libs: [], presets: [], scripts: [file('two.ahk', '2')] }));
        // Манифест b валиден, а чтение локальных файлов падает
        await manifest.write('b', data({ libs: [], presets: [], scripts: [file('x.ahk', '3')] }));
        await fs.mkdir(path.join(where.dir, 'b', 'scripts', 'x.ahk'), { recursive: true });

        const result = await metas();

        expect(result.scripts.map(s => s.id)).toEqual(['a:one.ahk', 'c:two.ahk']);
    });

    it('сбой чтения списка источников пробрасывается', async () => {
        store.list.mockRejectedValue(Object.assign(new Error('sources.json is corrupted'), { code: 'validation' }));

        await expect(metas()).rejects.toThrow('corrupted');
    });
});
