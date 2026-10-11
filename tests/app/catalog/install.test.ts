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
            manifest: `${where.dir}/${id}/.manifest.json`,
        }),
    },
}));
vi.mock('@cion-suite/core', async (importOriginal) => {
    const original = await importOriginal<typeof import('@cion-suite/core')>();
    return { ...original, logger: { ...original.logger, child: () => log } };
});

import { install } from '@app/catalog/install';
import { manifest, MANIFEST_VERSION } from '@app/catalog/manifest';
import type { ManifestFile } from '@app/catalog/types';
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

beforeEach(async () => {
    where.dir = await fs.mkdtemp(path.join(os.tmpdir(), 'warden-install-'));
    store.get.mockReset().mockResolvedValue(source);
    github.file.mockReset().mockImplementation((_s: unknown, repoPath: string) => Promise.resolve(bodyOf(repoPath)));
    log.warn.mockReset();
});

afterEach(async () => {
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
    });

    it('пишет скрипт и cfg_<файл> из manifest.cfgs', async () => {
        await synced('tool.ahk', { cfgs: [entry('cfg_tool.ahk')] });

        await install('a', 'tool.ahk');

        expect(await read('scripts/tool.ahk')).toBe('script body');
        expect(await read('scripts/cfg/cfg_tool.ahk')).toBe('cfg body');
        expect(github.file).toHaveBeenCalledWith(source, 'scripts/tool.ahk');
        expect(github.file).toHaveBeenCalledWith(source, 'scripts/cfg/cfg_tool.ahk', { fallback: null });
    });

    it('cfg чужого скрипта и cfg без записи в manifest не качаются', async () => {
        await synced('tool.ahk', { cfgs: [entry('cfg_other.ahk')] });

        await install('a', 'tool.ahk');

        expect(github.file).toHaveBeenCalledTimes(1);
        await expect(fs.stat(path.join(where.dir, 'a', 'scripts', 'cfg'))).rejects.toThrow();
    });

    it('cfg нет в репозитории - только скрипт', async () => {
        await synced('tool.ahk', { cfgs: [entry('cfg_tool.ahk')] });
        github.file.mockImplementation((_s: unknown, repoPath: string) =>
            Promise.resolve(repoPath.includes('/cfg/') ? null : bodyOf(repoPath)));

        await install('a', 'tool.ahk');

        await expect(fs.stat(path.join(where.dir, 'a', 'scripts', 'cfg'))).rejects.toThrow();
    });

    it('сбой cfg не валит установку скрипта, но попадает в лог', async () => {
        await synced('tool.ahk', { cfgs: [entry('cfg_tool.ahk')] });
        github.file.mockImplementation((_s: unknown, repoPath: string) =>
            repoPath.includes('/cfg/') ? Promise.reject(new Error('rate limited')) : Promise.resolve(bodyOf(repoPath)));

        await install('a', 'tool.ahk');

        expect(await read('scripts/tool.ahk')).toBe('script body');
        expect(log.warn).toHaveBeenCalledTimes(1);
    });

    it('support докачивается во вложенные папки scripts', async () => {
        await synced('tool.ahk', { support: [entry('misc/misc.ahk'), entry('misc/deep/more.ahk')] });

        await install('a', 'tool.ahk');

        expect(await read('scripts/misc/misc.ahk')).toBe('misc body');
        expect(await read('scripts/misc/deep/more.ahk')).toBe('misc body');
        expect(github.file).toHaveBeenCalledWith(source, 'scripts/misc/misc.ahk');
    });

    it('support с совпавшим sha не качается, с чужим - перекачивается', async () => {
        const same = fsx.sha(Buffer.from('misc body'));
        await synced('tool.ahk', { support: [entry('misc/same.ahk', same), entry('misc/changed.ahk', same)] });
        await fsx.write(path.join(where.dir, 'a', 'scripts', 'misc', 'same.ahk'), 'misc body');
        await fsx.write(path.join(where.dir, 'a', 'scripts', 'misc', 'changed.ahk'), 'stale');

        await install('a', 'tool.ahk');

        expect(github.file).not.toHaveBeenCalledWith(source, 'scripts/misc/same.ahk');
        expect(await read('scripts/misc/changed.ahk')).toBe('misc body');
    });

    it('сбой скачивания support пробрасывается, скрипт уже записан', async () => {
        await synced('tool.ahk', { support: [entry('misc/misc.ahk')] });
        github.file.mockImplementation((_s: unknown, repoPath: string) =>
            repoPath.includes('/misc/') ? Promise.reject(new Error('rate limited')) : Promise.resolve(bodyOf(repoPath)));

        await expect(install('a', 'tool.ahk')).rejects.toThrow('rate limited');
        expect(await read('scripts/tool.ahk')).toBe('script body');
        await expect(fs.stat(path.join(where.dir, 'a', 'scripts', 'misc', 'misc.ahk'))).rejects.toThrow();
    });

    it('ошибка чтения локального support, кроме ENOENT, не глотается', async () => {
        await synced('tool.ahk', { support: [entry('misc')] });
        await fs.mkdir(path.join(where.dir, 'a', 'scripts', 'misc'), { recursive: true });

        await expect(install('a', 'tool.ahk')).rejects.toThrow();
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
    });

    it('имя с выходом из каталога не пишется, даже если оно есть в manifest', async () => {
        await synced('../evil.ahk');

        await expect(install('a', '../evil.ahk')).rejects.toMatchObject({ code: 'validation' });
        await expect(fs.stat(path.join(where.dir, 'a', 'evil.ahk'))).rejects.toThrow();
    });
});
