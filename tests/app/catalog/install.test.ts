import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const where = vi.hoisted(() => ({ dir: '' }));
const github = vi.hoisted(() => ({ file: vi.fn() }));
const store = vi.hoisted(() => ({ get: vi.fn() }));
const log = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock('@app/github', () => ({ github }));
vi.mock('@app/sources/store', () => ({ store }));
vi.mock('@app/utils/paths', () => ({
    paths: {
        source: (id: string) => ({
            base: `${where.dir}/${id}`,
            scripts: `${where.dir}/${id}/scripts`,
            cfg: `${where.dir}/${id}/scripts/cfg`,
            lib: `${where.dir}/${id}/lib`,
            presets: `${where.dir}/${id}/presets`,
            manifest: `${where.dir}/${id}/.manifest.json`,
            versions: `${where.dir}/${id}/.versions.json`,
        }),
    },
}));
vi.mock('@cion-suite/core', async (importOriginal) => {
    const original = await importOriginal<typeof import('@cion-suite/core')>();
    return { ...original, logger: { ...original.logger, child: () => log } };
});

import { install } from '@app/catalog/install';
import { metas } from '@app/catalog/metas';
import { manifest, MANIFEST_VERSION } from '@app/catalog/manifest';
import type { ManifestFile } from '@app/catalog/types';
import { versions } from '@app/catalog/versions';
import { fsx } from '@app/utils/fsx';

const source = { id: 'a', type: 'git', name: 'o/r', url: 'https://github.com/o/r', branch: 'main', isPrivate: false };

type Entries = Partial<Pick<ManifestFile, 'cfgs' | 'support'>>;

const entry = (fileName: string, sha = '1') => ({ fileName, sha, downloadUrl: null });

const synced = (fileName = 'tool.ahk', extra: Entries = {}) => manifest.write('a', {
    version: MANIFEST_VERSION, etag: null, treeSha: null, branch: 'main', lastSyncedAt: 1, lastCheckedAt: 1,
    scripts: [entry(fileName)],
    cfgs: [], support: [], libs: [], presets: [], fonts: [],
    ...extra,
});

const bodyOf = (repoPath: string): Buffer =>
    Buffer.from(repoPath.includes('/cfg/') ? 'cfg body' : repoPath.includes('/misc/') ? 'misc body' : 'script body');

const read = (rel: string) => fs.readFile(path.join(where.dir, 'a', rel), 'utf8');

const seed = (rel: string, body: string) => fsx.write(path.join(where.dir, 'a', rel), body);

const sha = (body: string) => fsx.sha(Buffer.from(body));

const recorded = () => versions.read('a');

const failOn = (part: string) =>
    github.file.mockImplementation((_s: unknown, repoPath: string) =>
        repoPath.includes(part) ? Promise.reject(new Error('rate limited')) : Promise.resolve(bodyOf(repoPath)));

beforeEach(async () => {
    where.dir = await fs.mkdtemp(path.join(os.tmpdir(), 'warden-install-'));
    store.get.mockReset().mockResolvedValue(source);
    github.file.mockReset().mockImplementation((_s: unknown, repoPath: string) => Promise.resolve(bodyOf(repoPath)));
    log.warn.mockReset();
});

afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(where.dir, { recursive: true, force: true });
});

describe('install', () => {
    it('источник не синхронизирован - not_found', async () => {
        await expect(install('a', 'tool.ahk')).rejects.toMatchObject({ code: 'not_found', message: 'Source is not synced' });
        expect(github.file).not.toHaveBeenCalled();
    });

    it('файла нет в manifest - not_found, сеть не трогается', async () => {
        await synced();

        await expect(install('a', 'other.ahk')).rejects.toMatchObject({ code: 'not_found' });
        expect(github.file).not.toHaveBeenCalled();
        expect(await recorded()).toEqual({});
    });

    it('пишет скрипт и cfg_<файл> из manifest.cfgs', async () => {
        await synced('tool.ahk', { cfgs: [entry('cfg_tool.ahk')] });

        await install('a', 'tool.ahk');

        expect(await read('scripts/tool.ahk')).toBe('script body');
        expect(await read('scripts/cfg/cfg_tool.ahk')).toBe('cfg body');
        expect(github.file).toHaveBeenCalledWith(source, 'scripts/tool.ahk');
        expect(github.file).toHaveBeenCalledWith(source, 'scripts/cfg/cfg_tool.ahk');
    });

    it('cfg чужого скрипта и cfg без записи в manifest не качаются', async () => {
        await synced('tool.ahk', { cfgs: [entry('cfg_other.ahk')] });

        await install('a', 'tool.ahk');

        expect(github.file).toHaveBeenCalledTimes(1);
        await expect(fs.stat(path.join(where.dir, 'a', 'scripts', 'cfg'))).rejects.toThrow();
    });

    it('после успеха пишет версии скрипта и support, версию cfg - нет', async () => {
        await synced('tool.ahk', { cfgs: [entry('cfg_tool.ahk')], support: [entry('misc/misc.ahk')] });

        await install('a', 'tool.ahk');

        expect(await recorded()).toEqual({
            'scripts/tool.ahk': sha('script body'),
            'scripts/misc/misc.ahk': sha('misc body'),
        });
    });

    it('версия - sha скачанных байт, а не sha из manifest', async () => {
        await synced('tool.ahk', { support: [entry('misc/misc.ahk', 'from-manifest')] });

        await install('a', 'tool.ahk');

        const known = await recorded();
        expect(known['scripts/tool.ahk']).toBe(sha('script body'));
        expect(known['scripts/misc/misc.ahk']).toBe(sha('misc body'));
    });

    it('cfg нет в репозитории - установка падает, скрипта на диске нет', async () => {
        await synced('tool.ahk', { cfgs: [entry('cfg_tool.ahk')] });
        github.file.mockImplementation((_s: unknown, repoPath: string) =>
            repoPath.includes('/cfg/') ? Promise.reject(new Error('Not found')) : Promise.resolve(bodyOf(repoPath)));

        await expect(install('a', 'tool.ahk')).rejects.toThrow('Cannot download cfg_tool.ahk');

        await expect(fs.stat(path.join(where.dir, 'a', 'scripts', 'tool.ahk'))).rejects.toThrow();
        await expect(fs.stat(path.join(where.dir, 'a', 'scripts', 'cfg'))).rejects.toThrow();
        expect(await recorded()).toEqual({});
    });

    it('сбой скачивания cfg валит установку, скрипт и версия не пишутся', async () => {
        await synced('tool.ahk', { cfgs: [entry('cfg_tool.ahk')] });
        failOn('/cfg/');

        await expect(install('a', 'tool.ahk')).rejects.toThrow('cfg_tool.ahk');

        await expect(fs.stat(path.join(where.dir, 'a', 'scripts', 'tool.ahk'))).rejects.toThrow();
        expect(await recorded()).toEqual({});
    });

    it('support докачивается во вложенные папки scripts', async () => {
        await synced('tool.ahk', { support: [entry('misc/misc.ahk'), entry('misc/deep/more.ahk')] });

        await install('a', 'tool.ahk');

        expect(await read('scripts/misc/misc.ahk')).toBe('misc body');
        expect(await read('scripts/misc/deep/more.ahk')).toBe('misc body');
        expect(github.file).toHaveBeenCalledWith(source, 'scripts/misc/misc.ahk');
        expect(await recorded()).toMatchObject({ 'scripts/misc/deep/more.ahk': sha('misc body') });
    });

    it('support с актуальной записью и файлом не качается', async () => {
        const same = sha('misc body');
        await synced('tool.ahk', { support: [entry('misc/same.ahk', same)] });
        await seed('scripts/misc/same.ahk', 'misc body');
        await versions.record('a', { 'scripts/misc/same.ahk': same });

        await install('a', 'tool.ahk');

        expect(github.file).not.toHaveBeenCalledWith(source, 'scripts/misc/same.ahk');
        expect((await recorded())['scripts/misc/same.ahk']).toBe(same);
    });

    it('правка пользователя в support при актуальной записи не затирается', async () => {
        const same = sha('misc body');
        await synced('tool.ahk', { support: [entry('misc/same.ahk', same)] });
        await seed('scripts/misc/same.ahk', 'user edit');
        await versions.record('a', { 'scripts/misc/same.ahk': same });

        await install('a', 'tool.ahk');

        expect(await read('scripts/misc/same.ahk')).toBe('user edit');
        expect(github.file).not.toHaveBeenCalledWith(source, 'scripts/misc/same.ahk');
    });

    it('support без записи перекачивается, даже если файл есть', async () => {
        await synced('tool.ahk', { support: [entry('misc/misc.ahk', sha('misc body'))] });
        await seed('scripts/misc/misc.ahk', 'stale');

        await install('a', 'tool.ahk');

        expect(await read('scripts/misc/misc.ahk')).toBe('misc body');
        expect(github.file).toHaveBeenCalledWith(source, 'scripts/misc/misc.ahk');
    });

    it('support с чужой записью перекачивается', async () => {
        const fresh = sha('misc body');
        await synced('tool.ahk', { support: [entry('misc/misc.ahk', fresh)] });
        await seed('scripts/misc/misc.ahk', 'stale');
        await versions.record('a', { 'scripts/misc/misc.ahk': 'old-sha' });

        await install('a', 'tool.ahk');

        expect(await read('scripts/misc/misc.ahk')).toBe('misc body');
        expect((await recorded())['scripts/misc/misc.ahk']).toBe(fresh);
    });

    it('support с актуальной записью, но без файла перекачивается', async () => {
        const same = sha('misc body');
        await synced('tool.ahk', { support: [entry('misc/misc.ahk', same)] });
        await versions.record('a', { 'scripts/misc/misc.ahk': same });

        await install('a', 'tool.ahk');

        expect(await read('scripts/misc/misc.ahk')).toBe('misc body');
        expect(github.file).toHaveBeenCalledWith(source, 'scripts/misc/misc.ahk');
    });

    it('сбой скачивания support валит установку, скрипт и версия не пишутся', async () => {
        await synced('tool.ahk', { support: [entry('misc/misc.ahk')] });
        failOn('/misc/');

        await expect(install('a', 'tool.ahk')).rejects.toThrow('rate limited');

        await expect(fs.stat(path.join(where.dir, 'a', 'scripts', 'tool.ahk'))).rejects.toThrow();
        await expect(fs.stat(path.join(where.dir, 'a', 'scripts', 'misc', 'misc.ahk'))).rejects.toThrow();
        expect(await recorded()).toEqual({});
    });

    it('первая установка со сбоем cfg: metas не считает скрипт скачанным', async () => {
        await synced('tool.ahk', { cfgs: [entry('cfg_tool.ahk', sha('cfg body'))] });
        failOn('/cfg/');

        await expect(install('a', 'tool.ahk')).rejects.toThrow('cfg_tool.ahk');

        expect((await metas('a')).scripts[0]).toMatchObject({ isDownloaded: false, hasUpdate: false });
    });

    it('обновление со сбоем cfg: скрипт и запись прежние, hasUpdate true', async () => {
        await synced('tool.ahk', { cfgs: [entry('cfg_tool.ahk')] });
        await seed('scripts/tool.ahk', 'old script');
        await versions.record('a', { 'scripts/tool.ahk': 'old-sha' });
        failOn('/cfg/');

        await expect(install('a', 'tool.ahk')).rejects.toThrow('cfg_tool.ahk');

        expect(await read('scripts/tool.ahk')).toBe('old script');
        expect((await metas('a')).scripts[0]).toMatchObject({ isDownloaded: true, hasUpdate: true });
    });

    it('сбой versions.record оставляет файлы, записи версии нет', async () => {
        await synced('tool.ahk');
        vi.spyOn(versions, 'record').mockRejectedValue(new Error('disk full'));

        await expect(install('a', 'tool.ahk')).rejects.toThrow('disk full');

        expect(await read('scripts/tool.ahk')).toBe('script body');
        expect(await recorded()).toEqual({});
    });

    it('сбой fsx.json.write оставляет файлы, .versions.json не создаётся', async () => {
        await synced('tool.ahk');
        vi.spyOn(fsx.json, 'write').mockRejectedValue(new Error('disk full'));

        await expect(install('a', 'tool.ahk')).rejects.toThrow('disk full');

        expect(await read('scripts/tool.ahk')).toBe('script body');
        await expect(fs.stat(path.join(where.dir, 'a', '.versions.json'))).rejects.toThrow();
    });

    it('повторная установка после сбоя записи версий дописывает версию', async () => {
        await synced('tool.ahk');
        vi.spyOn(versions, 'record').mockRejectedValueOnce(new Error('disk full'));

        await expect(install('a', 'tool.ahk')).rejects.toThrow('disk full');
        await install('a', 'tool.ahk');

        expect(await recorded()).toEqual({ 'scripts/tool.ahk': sha('script body') });
    });

    it('ошибка записи локального support не глотается', async () => {
        await synced('tool.ahk', { support: [entry('misc')] });
        await fs.mkdir(path.join(where.dir, 'a', 'scripts', 'misc'), { recursive: true });

        await expect(install('a', 'tool.ahk')).rejects.toThrow();
        expect(await recorded()).toEqual({});
    });

    it('support с выходом из каталога не пишется', async () => {
        await synced('tool.ahk', { support: [entry('../../evil.ahk')] });

        await expect(install('a', 'tool.ahk')).rejects.toMatchObject({ code: 'validation' });
        await expect(fs.stat(path.join(where.dir, 'evil.ahk'))).rejects.toThrow();
    });

    it('отказ скачивания скрипта пробрасывается, файл не создаётся', async () => {
        await synced();
        github.file.mockRejectedValue(Object.assign(new Error('Token has no access'), { code: 'forbidden' }));

        await expect(install('a', 'tool.ahk')).rejects.toThrow('no access');
        await expect(fs.stat(path.join(where.dir, 'a', 'scripts', 'tool.ahk'))).rejects.toThrow();
        expect(await recorded()).toEqual({});
    });

    it('имя с выходом из каталога не пишется, даже если оно есть в manifest', async () => {
        await synced('../evil.ahk');

        await expect(install('a', '../evil.ahk')).rejects.toMatchObject({ code: 'validation' });
        await expect(fs.stat(path.join(where.dir, 'a', 'evil.ahk'))).rejects.toThrow();
    });
});
