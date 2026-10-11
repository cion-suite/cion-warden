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

const source = { id: 'a', type: 'git', name: 'o/r', url: 'https://github.com/o/r', branch: 'main', isPrivate: false };

const synced = (fileName = 'tool.ahk') => manifest.write('a', {
    version: MANIFEST_VERSION, etag: null, treeSha: null, branch: 'main', lastSyncedAt: 1, lastCheckedAt: 1,
    scripts: [{ fileName, sha: '1', downloadUrl: null }],
    cfgs: [], libs: [], presets: [], fonts: [],
});

const read = (rel: string) => fs.readFile(path.join(where.dir, 'a', rel), 'utf8');

beforeEach(async () => {
    where.dir = await fs.mkdtemp(path.join(os.tmpdir(), 'warden-install-'));
    store.get.mockReset().mockResolvedValue(source);
    github.file.mockReset().mockImplementation((_s: unknown, repoPath: string) =>
        Promise.resolve(repoPath.endsWith('.json') ? Buffer.from('{"cfg":1}') : Buffer.from('script body')));
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

    it('пишет скрипт и cfg в каталоги источника', async () => {
        await synced();

        await install('a', 'tool.ahk');

        expect(await read('scripts/tool.ahk')).toBe('script body');
        expect(await read('scripts/cfg/tool.json')).toBe('{"cfg":1}');
        expect(github.file).toHaveBeenCalledWith(source, 'scripts/tool.ahk');
        expect(github.file).toHaveBeenCalledWith(source, 'scripts/cfg/tool.json', { fallback: null });
    });

    it('cfg нет в репозитории - только скрипт', async () => {
        await synced();
        github.file.mockImplementation((_s: unknown, repoPath: string) =>
            Promise.resolve(repoPath.endsWith('.json') ? null : Buffer.from('script body')));

        await install('a', 'tool.ahk');

        await expect(fs.stat(path.join(where.dir, 'a', 'scripts', 'cfg'))).rejects.toThrow();
    });

    it('сбой cfg не валит установку скрипта, но попадает в лог', async () => {
        await synced();
        github.file.mockImplementation((_s: unknown, repoPath: string) =>
            repoPath.endsWith('.json') ? Promise.reject(new Error('rate limited')) : Promise.resolve(Buffer.from('script body')));

        await install('a', 'tool.ahk');

        expect(await read('scripts/tool.ahk')).toBe('script body');
        expect(log.warn).toHaveBeenCalledTimes(1);
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
