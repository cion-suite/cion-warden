import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const where = vi.hoisted(() => ({ dir: '' }));
const github = vi.hoisted(() => ({ tree: vi.fn(), file: vi.fn(), encode: (p: string) => p.split('/').map(encodeURIComponent).join('/') }));
const store = vi.hoisted(() => ({ get: vi.fn(), list: vi.fn() }));
const events = vi.hoisted(() => ({ emit: vi.fn() }));
const log = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock('@app/github', () => ({ github }));
vi.mock('@app/sources/store', () => ({ store }));
vi.mock('@app/utils/paths', () => ({
    paths: { source: (id: string) => ({ manifest: `${where.dir}/${id}.manifest.json` }) },
}));
vi.mock('@cion-suite/core', async (importOriginal) => {
    const original = await importOriginal<typeof import('@cion-suite/core')>();
    return { ...original, events, logger: { ...original.logger, child: () => log } };
});

import { manifest, MANIFEST_VERSION } from '@app/catalog/manifest';
import { sync } from '@app/catalog/sync';
import type { ManifestFile } from '@app/catalog/types';

const record = (id: string, branch = 'main') =>
    ({ id, type: 'git', name: `o/${id}`, url: `https://github.com/o/${id}`, branch, isPrivate: false });

const entry = (p: string) => ({ path: p, mode: '100644', type: 'blob', sha: `sha:${p}`, url: '' });
const reply = (paths: string[], etag: string | null = 'etag-1') => ({
    etag,
    tree: { sha: 'tree-sha', url: '', truncated: false, tree: paths.map(entry) },
});

const stored = (patch: Partial<ManifestFile> = {}): ManifestFile => ({
    version: MANIFEST_VERSION, etag: 'old-etag', treeSha: 't', branch: 'main', lastSyncedAt: 100, lastCheckedAt: 100,
    scripts: [], cfgs: [], support: [], libs: [], presets: [], fonts: [],
    ...patch,
});

beforeEach(async () => {
    where.dir = await fs.mkdtemp(path.join(os.tmpdir(), 'warden-sync-'));
    github.tree.mockReset().mockResolvedValue(reply(['scripts/a.ahk', 'scripts/cfg/cfg_a.ahk', 'scripts/misc/misc.ahk', 'presets/p.ahk', 'presets/old.json', 'lib/u.ahk']));
    github.file.mockReset().mockResolvedValue(null);
    store.get.mockReset().mockImplementation((id: string) => Promise.resolve(record(id)));
    store.list.mockReset().mockResolvedValue([record('a'), record('b')]);
    events.emit.mockReset();
    log.warn.mockReset();
    vi.useRealTimers();
});

afterEach(async () => {
    vi.useRealTimers();
    await fs.rm(where.dir, { recursive: true, force: true });
});

describe('sync(sourceId)', () => {
    it('неизвестный источник - not_found, сеть не трогается', async () => {
        store.get.mockRejectedValue(Object.assign(new Error('Source not found: z'), { code: 'not_found' }));

        await expect(sync('z')).rejects.toThrow('not found');
        expect(github.tree).not.toHaveBeenCalled();
    });

    it('первая синхронизация пишет manifest и объявляет source:synced', async () => {
        const [result] = await sync('a');

        expect(result).toMatchObject({ sourceId: 'a', fromCache: false });
        expect(events.emit).toHaveBeenCalledWith('source:synced', result);
        const data = await manifest.read('a');
        expect(data).toMatchObject({
            version: MANIFEST_VERSION,
            etag: 'etag-1',
            treeSha: 'tree-sha',
            branch: 'main',
            lastSyncedAt: result!.lastSyncedAt,
            scripts: [{ fileName: 'a.ahk', sha: 'sha:scripts/a.ahk' }],
            cfgs: [{ fileName: 'cfg_a.ahk' }],
            support: [{ fileName: 'misc/misc.ahk', sha: 'sha:scripts/misc/misc.ahk' }],
            presets: [{ fileName: 'p.ahk' }],
            libs: [{ name: 'u', kind: 'file' }],
        });
        expect(data?.presets).toHaveLength(1);
        expect(github.tree).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), undefined);
    });

    it('sidecar шрифтов скачивается только если есть в дереве и задаёт лицо', async () => {
        github.tree.mockResolvedValue(reply(['assets/fonts/_fonts.json', 'assets/fonts/x.ttf']));
        github.file.mockResolvedValue(Buffer.from(JSON.stringify({ fonts: [{ file: 'x.ttf', face: 'Brand X' }] })));

        await sync('a');

        expect(github.file).toHaveBeenCalledWith(expect.anything(), 'assets/fonts/_fonts.json', { fallback: null });
        expect((await manifest.read('a'))?.fonts).toMatchObject([{ fileName: 'x.ttf', face: 'Brand X' }]);

        github.file.mockClear();
        github.tree.mockResolvedValue(reply(['assets/fonts/y.ttf']));
        await sync('b');
        expect(github.file).not.toHaveBeenCalled();
    });

    it('сбой sidecar - предупреждение, шрифты берут лицо из имени файла', async () => {
        github.tree.mockResolvedValue(reply(['assets/fonts/_fonts.json', 'assets/fonts/x-y.ttf']));
        github.file.mockRejectedValue(new Error('boom'));

        await sync('a');

        expect(log.warn).toHaveBeenCalled();
        expect((await manifest.read('a'))?.fonts).toMatchObject([{ face: 'x y' }]);
    });

    it('свежий manifest (TTL) - без запроса, fromCache', async () => {
        await manifest.write('a', stored({ lastCheckedAt: Date.now() - 1_000 }));

        const [result] = await sync('a');

        expect(github.tree).not.toHaveBeenCalled();
        expect(result).toEqual({ sourceId: 'a', lastSyncedAt: 100, fromCache: true });
        expect(events.emit).toHaveBeenCalledWith('source:synced', result);
    });

    it('старый manifest - запрос с etag; 304 продлевает проверку и сохраняет записи', async () => {
        await manifest.write('a', stored({ lastCheckedAt: Date.now() - 60_000, scripts: [{ fileName: 'k.ahk', sha: '1', downloadUrl: null }] }));
        github.tree.mockResolvedValue(null);

        const [result] = await sync('a');

        expect(github.tree).toHaveBeenCalledWith(expect.anything(), 'old-etag');
        expect(result).toEqual({ sourceId: 'a', lastSyncedAt: 100, fromCache: true });
        const data = await manifest.read('a');
        expect(data?.lastSyncedAt).toBe(100);
        expect(data?.lastCheckedAt).toBeGreaterThan(Date.now() - 5_000);
        expect(data?.scripts).toHaveLength(1);
    });

    it('другая версия или ветка manifest - etag не используется', async () => {
        await manifest.write('a', stored({ version: 3, lastCheckedAt: 0 }));
        await sync('a');
        expect(github.tree).toHaveBeenLastCalledWith(expect.anything(), undefined);

        await manifest.write('b', stored({ branch: 'old', lastCheckedAt: 0 }));
        await sync('b');
        expect(github.tree).toHaveBeenLastCalledWith(expect.anything(), undefined);
    });

    it('304 без сохранённого manifest - failed со статусом 304', async () => {
        github.tree.mockResolvedValue(null);

        await expect(sync('a')).rejects.toMatchObject({ code: 'failed', status: 304, message: 'Manifest cache is missing' });
        expect(events.emit).not.toHaveBeenCalled();
    });

    it('параллельные вызовы делят один запрос', async () => {
        let release!: () => void;
        github.tree.mockImplementation(() => new Promise(resolve => {
            release = () => resolve(reply(['scripts/a.ahk']));
        }));

        const first = sync('a');
        const second = sync('a');
        await vi.waitFor(() => expect(github.tree).toHaveBeenCalledTimes(1));
        release();

        expect(await first).toEqual(await second);
        expect(github.tree).toHaveBeenCalledTimes(1);
        expect(events.emit).toHaveBeenCalledTimes(1);
    });

    it('другая ветка - отдельный запрос; после завершения ключ свободен', async () => {
        let release: Array<() => void> = [];
        github.tree.mockImplementation(() => new Promise(resolve => {
            release.push(() => resolve(reply([])));
        }));

        const main = sync('a');
        store.get.mockResolvedValue(record('a', 'dev'));
        const dev = sync('a');
        await vi.waitFor(() => expect(github.tree).toHaveBeenCalledTimes(2));
        release.forEach(done => done());
        await Promise.all([main, dev]);

        release = [];
        github.tree.mockResolvedValue(reply([]));
        await manifest.write('a', stored({ branch: 'dev', lastCheckedAt: 0 }));
        await sync('a');
        expect(github.tree).toHaveBeenCalledTimes(3);
    });
});

describe('sync()', () => {
    it('все источники; результат по порядку', async () => {
        const results = await sync();

        expect(results.map(r => r.sourceId)).toEqual(['a', 'b']);
        expect(events.emit).toHaveBeenCalledTimes(2);
    });

    it('отказ одного - ждёт остальных и бросает первый с его кодом', async () => {
        github.tree.mockImplementation((source: { id: string }) =>
            source.id === 'a'
                ? Promise.reject(Object.assign(new Error('GitHub token is invalid'), { code: 'unauthorized', status: 401 }))
                : Promise.resolve(reply([])));

        await expect(sync()).rejects.toThrow('Cannot sync all sources');

        expect(events.emit).toHaveBeenCalledWith('source:synced', expect.objectContaining({ sourceId: 'b' }));
    });

    it('сбой чтения списка источников пробрасывается', async () => {
        store.list.mockRejectedValue(new Error('sources.json is corrupted'));

        await expect(sync()).rejects.toThrow('corrupted');
    });
});
