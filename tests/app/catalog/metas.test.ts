import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const where = vi.hoisted(() => ({ dir: '' }));
const store = vi.hoisted(() => ({ get: vi.fn(), list: vi.fn() }));
const log = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock('@app/sources/store', () => ({ store }));
vi.mock('@cion-suite/core', async (importOriginal) => {
    const original = await importOriginal<typeof import('@cion-suite/core')>();
    return { ...original, logger: { ...original.logger, child: () => log } };
});
vi.mock('@app/utils/paths', () => ({
    paths: {
        source: (id: string) => ({
            base: `${where.dir}/${id}`,
            manifest: `${where.dir}/${id}/.manifest.json`,
            versions: `${where.dir}/${id}/.versions.json`,
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
    version: 5, etag: null, treeSha: null, branch: 'main', lastSyncedAt: 1, lastCheckedAt: 1,
    scripts: [file('a.ahk', sha), file('b.ahk', 'other')],
    cfgs: [],
    support: [],
    libs: [{
        name: 'pack', kind: 'folder', path: 'pack', sha: 'x',
        files: [{ path: 'pack/1.ahk', sha, downloadUrl: null }, { path: 'pack/2.ahk', sha: 'new', downloadUrl: null }],
    }],
    presets: [file('p.ahk', sha)],
    fonts: [],
    ...patch,
});

beforeEach(async () => {
    where.dir = await fs.mkdtemp(path.join(os.tmpdir(), 'warden-metas-'));
    store.get.mockReset().mockImplementation((id: string) => Promise.resolve(record(id)));
    store.list.mockReset().mockResolvedValue([record('a')]);
    log.warn.mockReset();
});

afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(where.dir, { recursive: true, force: true });
});

async function localFile(sourceId: string, rel: string, body: Buffer): Promise<void> {
    await fsx.write(path.join(where.dir, sourceId, rel), body);
}

const versionsFile = (sourceId: string) => path.join(where.dir, sourceId, '.versions.json');

const saveVersions = (sourceId: string, entries: Record<string, string>) => fsx.json.write(versionsFile(sourceId), entries);

const saved = (sourceId: string) => fsx.json.read<Record<string, string>>(versionsFile(sourceId));

// stat падает на одном пути, остальные - в настоящий fs
function failStat(suffix: string, code: string): void {
    const real = fs.stat.bind(fs) as (...args: unknown[]) => Promise<unknown>;
    vi.spyOn(fs, 'stat').mockImplementation(((target: unknown, ...rest: unknown[]) => {
        if (String(target).replaceAll('\\', '/').endsWith(suffix)) {
            return Promise.reject(Object.assign(new Error(code), { code }));
        }
        return real(target, ...rest);
    }) as typeof fs.stat);
}

describe('metas(sourceId)', () => {
    it('неизвестный источник - not_found', async () => {
        store.get.mockRejectedValue(Object.assign(new Error('Source not found'), { code: 'not_found' }));

        await expect(metas('zzz')).rejects.toThrow('not found');
    });

    it('источник без manifest - пустой каталог', async () => {
        await expect(metas('a')).resolves.toEqual({ scripts: [], libs: [], presets: [] });
    });

    it('файлы без записей: скачано, есть обновление, не скачано', async () => {
        await manifest.write('a', data());
        await localFile('a', 'scripts/a.ahk', content);
        await localFile('a', 'scripts/b.ahk', content);
        await localFile('a', 'lib/pack/1.ahk', content);
        await localFile('a', 'lib/pack/2.ahk', content);

        const result = await metas('a');

        expect(result.scripts).toMatchObject([
            { id: 'a:a.ahk', name: 'a', sourceId: 'a', sourceName: 'o/a', isDownloaded: true, hasUpdate: false },
            { id: 'a:b.ahk', isDownloaded: true, hasUpdate: true, sha: 'other' },
        ]);
        expect(result.scripts[0]).not.toHaveProperty('localSha');
        expect(result.libs).toMatchObject([{ id: 'a:lib:pack', isDownloaded: true, hasUpdate: true }]);
        expect(result.presets).toMatchObject([{ id: 'a:preset:p.ahk', isDownloaded: false, hasUpdate: false }]);
    });

    it('.local-cache.json не читается и не пишется', async () => {
        const cache = path.join(where.dir, 'a', '.local-cache.json');
        const body = JSON.stringify({ 'scripts/a.ahk': { sha: 'stale' } });
        await manifest.write('a', data());
        await localFile('a', 'scripts/a.ahk', content);
        await fs.writeFile(cache, body);

        expect((await metas('a')).scripts[0]).toMatchObject({ hasUpdate: false });
        expect(await fs.readFile(cache, 'utf8')).toBe(body);
    });

    describe('скрипт', () => {
        it('правка скачанного при записи, равной sha manifest, не даёт hasUpdate', async () => {
            await manifest.write('a', data());
            await localFile('a', 'scripts/a.ahk', Buffer.from('edited by user'));
            await saveVersions('a', { 'scripts/a.ahk': sha });

            expect((await metas('a')).scripts[0]).toMatchObject({ isDownloaded: true, hasUpdate: false });
            expect(await saved('a')).toEqual({ 'scripts/a.ahk': sha });
        });

        it('смена sha в manifest даёт hasUpdate', async () => {
            await manifest.write('a', data());
            await localFile('a', 'scripts/a.ahk', content);
            await saveVersions('a', { 'scripts/a.ahk': 'older' });

            expect((await metas('a')).scripts[0]).toMatchObject({ isDownloaded: true, hasUpdate: true });
        });

        it('совпадение содержимого с manifest не перетирает старую запись', async () => {
            await manifest.write('a', data());
            await localFile('a', 'scripts/a.ahk', content);
            await saveVersions('a', { 'scripts/a.ahk': 'older' });

            await metas('a');

            expect(await saved('a')).toEqual({ 'scripts/a.ahk': 'older' });
        });

        it('без записи: sha содержимого равен manifest - запись создаётся', async () => {
            await manifest.write('a', data());
            await localFile('a', 'scripts/a.ahk', content);

            expect((await metas('a')).scripts[0]).toMatchObject({ isDownloaded: true, hasUpdate: false });
            expect(await saved('a')).toEqual({ 'scripts/a.ahk': sha });
        });

        it('без записи: sha содержимого не равен manifest - hasUpdate и записи нет', async () => {
            await manifest.write('a', data());
            await localFile('a', 'scripts/b.ahk', Buffer.from('edited'));

            expect((await metas('a')).scripts[1]).toMatchObject({ isDownloaded: true, hasUpdate: true });
            expect(await saved('a')).toBeUndefined();
        });

        it('без записи: ошибка чтения содержимого - hasUpdate false и warn', async () => {
            await manifest.write('a', data());
            // stat каталога проходит, readFile даёт EISDIR
            await fs.mkdir(path.join(where.dir, 'a', 'scripts', 'a.ahk'), { recursive: true });

            expect((await metas('a')).scripts[0]).toMatchObject({ isDownloaded: true, hasUpdate: false });
            expect(log.warn).toHaveBeenCalledWith('Local file unreadable', expect.anything(), { sourceId: 'a', key: 'scripts/a.ahk' });
            expect(await saved('a')).toBeUndefined();
        });

        it('ошибка stat не ENOENT не превращается в "не скачан"', async () => {
            await manifest.write('a', data());
            await localFile('a', 'scripts/a.ahk', content);
            failStat('scripts/a.ahk', 'EACCES');

            expect((await metas('a')).scripts[0]).toMatchObject({ isDownloaded: true, hasUpdate: false });
            expect(log.warn).toHaveBeenCalledWith('Local file unreadable', expect.anything(), { sourceId: 'a', key: 'scripts/a.ahk' });
            expect(await saved('a')).toBeUndefined();
        });

        it('нет файла - не скачан, без обновления и без warn', async () => {
            await manifest.write('a', data());

            expect((await metas('a')).scripts[0]).toMatchObject({ isDownloaded: false, hasUpdate: false });
            expect(log.warn).not.toHaveBeenCalled();
        });
    });

    describe('cfg скрипта', () => {
        const withCfg = () => manifest.write('a', data({ cfgs: [file('cfg_a.ahk', 'c')] }));

        it('в manifest есть, рабочего файла нет: hasUpdate у скачанного скрипта', async () => {
            await withCfg();
            await localFile('a', 'scripts/a.ahk', content);

            expect((await metas('a')).scripts[0]).toMatchObject({ isDownloaded: true, hasUpdate: true });
        });

        it('нескачанному скрипту hasUpdate не ставится', async () => {
            await withCfg();

            expect((await metas('a')).scripts[0]).toMatchObject({ isDownloaded: false, hasUpdate: false });
        });

        it('рабочий файл есть: правка и расхождение с manifest не дают hasUpdate', async () => {
            await withCfg();
            await localFile('a', 'scripts/a.ahk', content);
            await localFile('a', 'scripts/cfg/cfg_a.ahk', Buffer.from('edited by user'));

            expect((await metas('a')).scripts[0]).toMatchObject({ hasUpdate: false });
            expect(await saved('a')).toEqual({ 'scripts/a.ahk': sha });
        });

        it('cfg чужого скрипта и скрипт без cfg в manifest: hasUpdate false', async () => {
            await manifest.write('a', data({ cfgs: [file('cfg_b.ahk', 'c')] }));
            await localFile('a', 'scripts/a.ahk', content);

            expect((await metas('a')).scripts[0]).toMatchObject({ hasUpdate: false });
        });

        it('ошибка stat не ENOENT: файл считается скачанным, hasUpdate false и warn', async () => {
            await withCfg();
            await localFile('a', 'scripts/a.ahk', content);
            failStat('scripts/cfg/cfg_a.ahk', 'EACCES');

            expect((await metas('a')).scripts[0]).toMatchObject({ hasUpdate: false });
            expect(log.warn).toHaveBeenCalledWith('Local file unreadable', expect.anything(), { sourceId: 'a', key: 'scripts/cfg/cfg_a.ahk' });
        });
    });

    describe('support', () => {
        const withSupport = () => manifest.write('a', data({ support: [file('misc/misc.ahk', sha)] }));

        it('нет файла: hasUpdate у скачанных скриптов, у нескачанных нет', async () => {
            await withSupport();
            await localFile('a', 'scripts/a.ahk', content);

            const result = (await metas('a')).scripts;

            expect(result[0]).toMatchObject({ isDownloaded: true, hasUpdate: true });
            expect(result[1]).toMatchObject({ isDownloaded: false, hasUpdate: false });
        });

        it('запись не равна sha manifest: hasUpdate у скачанных скриптов, у нескачанных нет', async () => {
            await withSupport();
            await localFile('a', 'scripts/a.ahk', content);
            await localFile('a', 'scripts/misc/misc.ahk', content);
            await saveVersions('a', { 'scripts/misc/misc.ahk': 'older' });

            const result = (await metas('a')).scripts;

            expect(result[0]).toMatchObject({ isDownloaded: true, hasUpdate: true });
            expect(result[1]).toMatchObject({ isDownloaded: false, hasUpdate: false });
        });

        it('запись равна sha manifest: правка файла не даёт hasUpdate', async () => {
            await withSupport();
            await localFile('a', 'scripts/a.ahk', content);
            await localFile('a', 'scripts/misc/misc.ahk', Buffer.from('changed'));
            await saveVersions('a', { 'scripts/misc/misc.ahk': sha });

            expect((await metas('a')).scripts[0]).toMatchObject({ isDownloaded: true, hasUpdate: false });
        });

        it('без записи: изменённый файл даёт hasUpdate, совпавший - запись по ключу scripts/<путь>', async () => {
            await withSupport();
            await localFile('a', 'scripts/a.ahk', content);
            await localFile('a', 'scripts/misc/misc.ahk', Buffer.from('changed'));
            expect((await metas('a')).scripts[0]).toMatchObject({ hasUpdate: true });

            await localFile('a', 'scripts/misc/misc.ahk', content);
            expect((await metas('a')).scripts[0]).toMatchObject({ hasUpdate: false });
            expect((await saved('a'))?.['scripts/misc/misc.ahk']).toBe(sha);
        });
    });

    describe('lib и пресет', () => {
        it('правка lib-файла и пресета при записях, равных sha manifest, не даёт hasUpdate', async () => {
            await manifest.write('a', data());
            await localFile('a', 'lib/pack/1.ahk', Buffer.from('edited'));
            await localFile('a', 'lib/pack/2.ahk', Buffer.from('edited'));
            await localFile('a', 'presets/p.ahk', Buffer.from('edited'));
            await saveVersions('a', { 'lib/pack/1.ahk': sha, 'lib/pack/2.ahk': 'new', 'presets/p.ahk': sha });

            const result = await metas('a');

            expect(result.libs[0]).toMatchObject({ isDownloaded: true, hasUpdate: false });
            expect(result.presets[0]).toMatchObject({ isDownloaded: true, hasUpdate: false });
        });

        it('смена sha пресета в manifest даёт hasUpdate', async () => {
            await manifest.write('a', data());
            await localFile('a', 'presets/p.ahk', content);
            await saveVersions('a', { 'presets/p.ahk': 'older' });

            expect((await metas('a')).presets[0]).toMatchObject({ isDownloaded: true, hasUpdate: true });
        });

        it('lib: hasUpdate, если устарел любой файл', async () => {
            await manifest.write('a', data());
            await localFile('a', 'lib/pack/1.ahk', content);
            await localFile('a', 'lib/pack/2.ahk', content);
            await saveVersions('a', { 'lib/pack/1.ahk': sha, 'lib/pack/2.ahk': 'older' });

            expect((await metas('a')).libs[0]).toMatchObject({ isDownloaded: true, hasUpdate: true });
        });

        it('lib с отсутствующим файлом не скачана и без обновления', async () => {
            await manifest.write('a', data());
            await localFile('a', 'lib/pack/2.ahk', content);

            expect((await metas('a')).libs[0]).toMatchObject({ isDownloaded: false, hasUpdate: false });
        });

        it('lib без файлов не считается скачанной', async () => {
            await manifest.write('a', data({ libs: [{ name: 'empty', kind: 'folder', path: 'empty', sha: '1', files: [] }] }));

            expect((await metas('a')).libs[0]).toMatchObject({ isDownloaded: false, hasUpdate: false });
        });
    });

    it('битый .versions.json читается как пустой, список не ломается', async () => {
        await manifest.write('a', data());
        await localFile('a', 'scripts/a.ahk', content);
        await fs.writeFile(versionsFile('a'), '{oops');

        expect((await metas('a')).scripts[0]).toMatchObject({ isDownloaded: true, hasUpdate: false });
        expect(await saved('a')).toEqual({ 'scripts/a.ahk': sha });
    });
});

describe('metas()', () => {
    it('объединяет источники, упавший пропускает', async () => {
        store.list.mockResolvedValue([record('a'), record('b'), record('c')]);
        await manifest.write('a', data({ libs: [], presets: [], scripts: [file('one.ahk', '1')] }));
        await manifest.write('c', data({ libs: [], presets: [], scripts: [file('two.ahk', '2')] }));
        await manifest.write('b', data({ libs: [], presets: [], scripts: [file('x.ahk', '3')] }));
        // Чтение manifest источника b падает
        const read = manifest.read.bind(manifest);
        vi.spyOn(manifest, 'read').mockImplementation((id: string) =>
            id === 'b' ? Promise.reject(new Error('boom')) : read(id));

        const result = await metas();

        expect(result.scripts.map(s => s.id)).toEqual(['a:one.ahk', 'c:two.ahk']);
        expect(log.warn).toHaveBeenCalledWith('Source catalog failed', expect.any(Error), { sourceId: 'b' });
    });

    it('сбой чтения списка источников пробрасывается', async () => {
        store.list.mockRejectedValue(Object.assign(new Error('sources.json is corrupted'), { code: 'validation' }));

        await expect(metas()).rejects.toThrow('corrupted');
    });
});
