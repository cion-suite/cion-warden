import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const where = vi.hoisted(() => ({ dir: '' }));
const log = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock('@app/utils/paths', () => ({
    paths: {
        source: (id: string) => ({
            base: `${where.dir}/${id}`,
            versions: `${where.dir}/${id}/.versions.json`,
        }),
    },
}));
vi.mock('@cion-suite/core', async (importOriginal) => {
    const original = await importOriginal<typeof import('@cion-suite/core')>();
    return { ...original, logger: { ...original.logger, child: () => log } };
});

import { versions } from '@app/catalog/versions';

const file = (id: string) => path.join(where.dir, id, '.versions.json');

const onDisk = async (id: string): Promise<unknown> => JSON.parse(await fs.readFile(file(id), 'utf8'));

const seed = async (id: string, raw: string): Promise<void> => {
    await fs.mkdir(path.join(where.dir, id), { recursive: true });
    await fs.writeFile(file(id), raw);
};

beforeEach(async () => {
    where.dir = await fs.mkdtemp(path.join(os.tmpdir(), 'warden-versions-'));
    log.warn.mockReset();
});

afterEach(async () => {
    await fs.rm(where.dir, { recursive: true, force: true });
});

describe('versions.read', () => {
    it('нет файла - пустой объект без предупреждения', async () => {
        expect(await versions.read('a')).toEqual({});
        expect(log.warn).not.toHaveBeenCalled();
    });

    it('читает записанное', async () => {
        await seed('a', JSON.stringify({ 'scripts/tool.ahk': 'sha1', 'lib/x.ahk': 'sha2' }));

        expect(await versions.read('a')).toEqual({ 'scripts/tool.ahk': 'sha1', 'lib/x.ahk': 'sha2' });
    });

    it('битый JSON - пустой объект и warn', async () => {
        await seed('a', '{oops');

        expect(await versions.read('a')).toEqual({});
        expect(log.warn).toHaveBeenCalledTimes(1);
    });

    it('массив - неверная форма, пустой объект', async () => {
        await seed('a', JSON.stringify(['sha1']));

        expect(await versions.read('a')).toEqual({});
        expect(log.warn).toHaveBeenCalledTimes(1);
    });

    it('значения не строки - пустой объект', async () => {
        await seed('a', JSON.stringify({ 'scripts/tool.ahk': 1 }));

        expect(await versions.read('a')).toEqual({});
        expect(log.warn).toHaveBeenCalledTimes(1);
    });

    it('null вместо объекта - пустой объект', async () => {
        await seed('a', 'null');

        expect(await versions.read('a')).toEqual({});
    });
});

describe('versions.record', () => {
    it('создаёт файл и пишет ключи', async () => {
        await versions.record('a', { 'scripts/tool.ahk': 'sha1' });

        expect(await onDisk('a')).toEqual({ 'scripts/tool.ahk': 'sha1' });
        expect(await versions.read('a')).toEqual({ 'scripts/tool.ahk': 'sha1' });
    });

    it('сливает с существующими и перезаписывает совпавший ключ', async () => {
        await versions.record('a', { 'scripts/a.ahk': 'old', 'lib/x.ahk': 'keep' });

        await versions.record('a', { 'scripts/a.ahk': 'new', 'presets/p.json': 'sha3' });

        expect(await onDisk('a')).toEqual({ 'scripts/a.ahk': 'new', 'lib/x.ahk': 'keep', 'presets/p.json': 'sha3' });
    });

    it('параллельные record одного источника не теряют записи', async () => {
        const keys = Array.from({ length: 20 }, (_, i) => `scripts/f${i}.ahk`);

        await Promise.all(keys.map((key) => versions.record('a', { [key]: `sha-${key}` })));

        expect(await onDisk('a')).toEqual(Object.fromEntries(keys.map((key) => [key, `sha-${key}`])));
    });

    it('параллельные record двух источников независимы', async () => {
        await Promise.all([
            versions.record('a', { 'scripts/a.ahk': 'sa' }),
            versions.record('b', { 'scripts/b.ahk': 'sb' }),
            versions.record('a', { 'lib/a.ahk': 'la' }),
            versions.record('b', { 'lib/b.ahk': 'lb' }),
        ]);

        expect(await onDisk('a')).toEqual({ 'scripts/a.ahk': 'sa', 'lib/a.ahk': 'la' });
        expect(await onDisk('b')).toEqual({ 'scripts/b.ahk': 'sb', 'lib/b.ahk': 'lb' });
    });

    it('после битого файла пересоздаёт его', async () => {
        await seed('a', '{oops');

        await versions.record('a', { 'scripts/tool.ahk': 'sha1' });

        expect(await onDisk('a')).toEqual({ 'scripts/tool.ahk': 'sha1' });
        expect(log.warn).toHaveBeenCalled();
    });

    it('после файла неверной формы пересоздаёт его', async () => {
        await seed('a', JSON.stringify(['x']));

        await versions.record('a', { 'scripts/tool.ahk': 'sha1' });

        expect(await onDisk('a')).toEqual({ 'scripts/tool.ahk': 'sha1' });
    });

    it('пустой объект файл не создаёт', async () => {
        await versions.record('a', {});

        await expect(fs.access(file('a'))).rejects.toMatchObject({ code: 'ENOENT' });
        await expect(fs.access(path.join(where.dir, 'a'))).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('пустой объект не трогает существующий файл', async () => {
        await seed('a', '{oops');

        await versions.record('a', {});

        expect(await fs.readFile(file('a'), 'utf8')).toBe('{oops');
    });

    it('не оставляет tmp-файлов', async () => {
        await Promise.all([
            versions.record('a', { 'scripts/a.ahk': '1' }),
            versions.record('a', { 'scripts/b.ahk': '2' }),
        ]);

        expect(await fs.readdir(path.join(where.dir, 'a'))).toEqual(['.versions.json']);
    });
});

describe('versions.adopt', () => {
    it('создаёт файл с отсутствующими ключами', async () => {
        await versions.adopt('a', { 'scripts/tool.ahk': 'sha1' });

        expect(await onDisk('a')).toEqual({ 'scripts/tool.ahk': 'sha1' });
    });

    it('существующий ключ не перезаписывает, новые добавляет', async () => {
        await versions.record('a', { 'scripts/a.ahk': 'recorded' });

        await versions.adopt('a', { 'scripts/a.ahk': 'stale', 'scripts/b.ahk': 'fresh' });

        expect(await onDisk('a')).toEqual({ 'scripts/a.ahk': 'recorded', 'scripts/b.ahk': 'fresh' });
    });

    it('гонка: adopt запущен раньше record - итог значение record', async () => {
        await Promise.all([
            versions.adopt('a', { 'scripts/a.ahk': 'stale' }),
            versions.record('a', { 'scripts/a.ahk': 'recorded' }),
        ]);

        expect(await onDisk('a')).toEqual({ 'scripts/a.ahk': 'recorded' });
    });

    it('гонка: record запущен раньше adopt - итог значение record', async () => {
        await Promise.all([
            versions.record('a', { 'scripts/a.ahk': 'recorded' }),
            versions.adopt('a', { 'scripts/a.ahk': 'stale' }),
        ]);

        expect(await onDisk('a')).toEqual({ 'scripts/a.ahk': 'recorded' });
    });

    it('пустой объект файл не создаёт', async () => {
        await versions.adopt('a', {});

        await expect(fs.access(path.join(where.dir, 'a'))).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('после битого файла пересоздаёт его', async () => {
        await seed('a', '{oops');

        await versions.adopt('a', { 'scripts/tool.ahk': 'sha1' });

        expect(await onDisk('a')).toEqual({ 'scripts/tool.ahk': 'sha1' });
    });
});
