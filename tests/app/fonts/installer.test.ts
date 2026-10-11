import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const where = vi.hoisted(() => ({ dir: '' }));
const github = vi.hoisted(() => ({ file: vi.fn() }));
const manifest = vi.hoisted(() => ({ read: vi.fn() }));
const registry = vi.hoisted(() => ({
    name: (sourceId: string, face: string) => `[${sourceId}] ${face}`,
    add: vi.fn(),
    delete: vi.fn(),
    broadcast: vi.fn(),
}));

vi.mock('@app/github', () => ({ github }));
vi.mock('@app/fonts/registry', () => ({ registry }));
vi.mock('@app/catalog', () => ({
    catalog: {
        dir: { fonts: 'assets/fonts' },
        manifest,
        font: { id: (sourceId: string, fileName: string) => `${sourceId}:font:${fileName}` },
    },
}));
vi.mock('@app/utils/paths', () => ({
    paths: { fonts: { index: () => `${where.dir}/installed-fonts.json`, dir: () => `${where.dir}/Fonts` } },
}));

import { installer } from '@app/fonts/installer';
import type { Font } from '@shared/types';
import { fsx } from '@app/utils/fsx';

const platform = process.platform;
const setPlatform = (value: string) => Object.defineProperty(process, 'platform', { value, configurable: true });

const source = { id: 'a', type: 'git', name: 'o/r', url: 'https://github.com/o/r', branch: 'dev', isPrivate: false } as const;
const body = Buffer.from('font-bytes');
const sha = fsx.sha(body);

const entry = (fileName: string, patch: object = {}) =>
    ({ fileName, face: fileName.replace(/\..+$/, ''), sha, downloadUrl: null, ...patch });
const data = (...fonts: object[]) => ({ branch: 'main', fonts });
const dest = (fileName: string, sourceId = 'a') => path.join(where.dir, 'Fonts', `${sourceId}__${fileName}`);
const index = async () => JSON.parse(await fs.readFile(path.join(where.dir, 'installed-fonts.json'), 'utf8')) as Record<string, Font>;

const record = (sourceId: string, fileName: string): Font => ({
    assetId: `${sourceId}:font:${fileName}`,
    sourceId,
    fileName,
    face: fileName,
    sha,
    systemPath: dest(fileName, sourceId),
    registryName: `[${sourceId}] ${fileName}`,
    installedAt: 1,
});

async function seed(...fonts: Font[]): Promise<void> {
    await fsx.json.write(path.join(where.dir, 'installed-fonts.json'), Object.fromEntries(fonts.map(f => [f.assetId, f])));
    for (const font of fonts) await fsx.write(font.systemPath, body);
}

beforeEach(async () => {
    where.dir = await fs.mkdtemp(path.join(os.tmpdir(), 'warden-fonts-'));
    setPlatform('win32');
    github.file.mockReset().mockResolvedValue(body);
    manifest.read.mockReset().mockResolvedValue(data(entry('x.ttf')));
    registry.add.mockReset().mockReturnValue({ ok: true, stderr: '' });
    registry.delete.mockReset();
    registry.broadcast.mockReset().mockResolvedValue(undefined);
});

afterEach(async () => {
    setPlatform(platform);
    await fs.rm(where.dir, { recursive: true, force: true });
});

describe('installer.install', () => {
    it('не win32 - ничего не делает', async () => {
        setPlatform('linux');

        await expect(installer.install(source)).resolves.toEqual({ ok: 0, failed: 0, skipped: 0 });

        expect(manifest.read).not.toHaveBeenCalled();
    });

    it('нет manifest - ничего', async () => {
        manifest.read.mockResolvedValue(null);

        await expect(installer.install(source)).resolves.toEqual({ ok: 0, failed: 0, skipped: 0 });
    });

    it('скачивает с веткой manifest, пишет файл, реестр и индекс, оповещает систему', async () => {
        await expect(installer.install(source)).resolves.toEqual({ ok: 1, failed: 0, skipped: 0 });

        expect(github.file).toHaveBeenCalledWith({ ...source, branch: 'main' }, 'assets/fonts/x.ttf', { fallback: null });
        expect(await fs.readFile(dest('x.ttf'))).toEqual(body);
        expect(registry.add).toHaveBeenCalledWith('[a] x', dest('x.ttf'));
        expect(await index()).toMatchObject({ 'a:font:x.ttf': { sourceId: 'a', fileName: 'x.ttf', sha, systemPath: dest('x.ttf'), registryName: '[a] x' } });
        expect(registry.broadcast).toHaveBeenCalledWith([dest('x.ttf')], []);
    });

    it('повтор: запись в индексе и файл на месте - пропуск без сети и реестра', async () => {
        await installer.install(source);
        github.file.mockClear();
        registry.add.mockClear();

        await expect(installer.install(source)).resolves.toEqual({ ok: 0, failed: 0, skipped: 1 });

        expect(github.file).not.toHaveBeenCalled();
        expect(registry.add).not.toHaveBeenCalled();
    });

    it('файл удалили руками - ставится заново', async () => {
        await installer.install(source);
        await fs.rm(dest('x.ttf'));

        await expect(installer.install(source)).resolves.toMatchObject({ ok: 1, skipped: 0 });
        expect(await fs.readFile(dest('x.ttf'))).toEqual(body);
    });

    it('файл с тем же sha на диске не качается заново, но регистрируется', async () => {
        await fsx.write(dest('x.ttf'), body);

        await expect(installer.install(source)).resolves.toMatchObject({ ok: 1 });

        expect(github.file).not.toHaveBeenCalled();
        expect(registry.add).toHaveBeenCalledTimes(1);
    });

    it('skip и 404 в репозитории - пропуск', async () => {
        manifest.read.mockResolvedValue(data(entry('old.fon', { skip: true }), entry('gone.ttf')));
        github.file.mockResolvedValue(null);

        await expect(installer.install(source)).resolves.toEqual({ ok: 0, failed: 0, skipped: 2 });

        expect(github.file).toHaveBeenCalledTimes(1);
        expect(registry.add).not.toHaveBeenCalled();
    });

    it('отказ reg add - failed, новый файл не остаётся', async () => {
        registry.add.mockReturnValue({ ok: false, stderr: 'denied' });

        await expect(installer.install(source)).resolves.toEqual({ ok: 0, failed: 1, skipped: 0 });

        await expect(fs.stat(dest('x.ttf'))).rejects.toThrow();
        expect(registry.broadcast).toHaveBeenCalledWith([], []);
    });

    it('сбой скачивания одного шрифта не мешает остальным', async () => {
        manifest.read.mockResolvedValue(data(entry('bad.ttf'), entry('good.ttf')));
        github.file.mockImplementation((_s: unknown, repoPath: string) =>
            repoPath.endsWith('bad.ttf') ? Promise.reject(new Error('rate limited')) : Promise.resolve(body));

        await expect(installer.install(source)).resolves.toEqual({ ok: 1, failed: 1, skipped: 0 });
    });

    it('сменилось лицо - старое значение реестра удаляется и выгружается', async () => {
        await installer.install(source);
        manifest.read.mockResolvedValue(data(entry('x.ttf', { face: 'Renamed' })));
        registry.broadcast.mockClear();

        await expect(installer.install(source)).resolves.toMatchObject({ ok: 1 });

        expect(registry.delete).toHaveBeenCalledWith('[a] x');
        expect(registry.add).toHaveBeenLastCalledWith('[a] Renamed', dest('x.ttf'));
        expect(registry.broadcast).toHaveBeenCalledWith([dest('x.ttf')], [dest('x.ttf')]);
    });

    it('параллельные установки идут по очереди: индекс не теряет записи', async () => {
        const other = { ...source, id: 'b' };
        manifest.read.mockImplementation((id: string) => Promise.resolve(data(entry(`${id}.ttf`))));

        await Promise.all([installer.install(source), installer.install(other)]);

        expect(Object.keys(await index()).sort()).toEqual(['a:font:a.ttf', 'b:font:b.ttf']);
    });
});

describe('installer.remove', () => {
    it('убирает файл, значение реестра и запись только этого источника', async () => {
        await seed(record('a', 'x.ttf'), record('b', 'y.ttf'));

        await installer.remove('a');

        await expect(fs.stat(dest('x.ttf'))).rejects.toThrow();
        await expect(fs.stat(dest('y.ttf', 'b'))).resolves.toBeTruthy();
        expect(registry.delete).toHaveBeenCalledWith('[a] x.ttf');
        expect(Object.keys(await index())).toEqual(['b:font:y.ttf']);
        expect(registry.broadcast).toHaveBeenCalledWith([], [dest('x.ttf')]);
    });

    it('нечего удалять - индекс и система не трогаются', async () => {
        await seed(record('b', 'y.ttf'));

        await installer.remove('a');

        expect(registry.delete).not.toHaveBeenCalled();
        expect(registry.broadcast).not.toHaveBeenCalled();
    });

    it('не win32 - no-op', async () => {
        await seed(record('a', 'x.ttf'));
        setPlatform('linux');

        await installer.remove('a');

        expect(registry.delete).not.toHaveBeenCalled();
        await expect(fs.stat(dest('x.ttf'))).resolves.toBeTruthy();
    });
});

describe('installer.prune', () => {
    it('убирает шрифты источников вне списка', async () => {
        await seed(record('a', 'x.ttf'), record('gone', 'y.ttf'));

        await installer.prune(new Set(['a']));

        expect(Object.keys(await index())).toEqual(['a:font:x.ttf']);
        expect(registry.delete).toHaveBeenCalledWith('[gone] y.ttf');
    });

    it('пустой список источников убирает всё (вызывающий отвечает за прочитанный список)', async () => {
        await seed(record('a', 'x.ttf'));

        await installer.prune(new Set());

        expect(await index()).toEqual({});
    });
});

describe('installer.list', () => {
    it('нет индекса или битый - пустой список', async () => {
        await expect(installer.list()).resolves.toEqual([]);

        await fs.writeFile(path.join(where.dir, 'installed-fonts.json'), '{oops');
        await expect(installer.list()).resolves.toEqual([]);
    });

    it('отдаёт записи индекса', async () => {
        await seed(record('a', 'x.ttf'));

        await expect(installer.list()).resolves.toEqual([record('a', 'x.ttf')]);
    });
});

describe('installer.all', () => {
    it('сбой одного источника не мешает остальным', async () => {
        manifest.read.mockImplementation((id: string) =>
            id === 'a' ? Promise.reject(new Error('boom')) : Promise.resolve(data(entry('y.ttf'))));

        await installer.all([source, { ...source, id: 'b' }]);

        expect(Object.keys(await index())).toEqual(['b:font:y.ttf']);
    });
});
