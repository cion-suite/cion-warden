import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fsx } from '@app/utils/fsx';

let dir: string;

beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'warden-fsx-'));
});

afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});

describe('fsx.confine', () => {
    it('возвращает путь внутри root', () => {
        const child = path.join(dir, 'a', 'b.txt');

        expect(fsx.confine(dir, child)).toBe(child);
    });

    it('отвергает выход через .. , сам root и соседа с общим префиксом', () => {
        for (const child of [path.join(dir, '..', 'x'), dir, `${dir}-evil`, path.join(dir, 'a', '..', '..', 'x')]) {
            expect(() => fsx.confine(dir, child), child).toThrow(/escapes/);
        }
        expect(() => fsx.confine(dir, path.join(dir, '..'))).toThrowError(expect.objectContaining({ code: 'validation' }));
    });

    it('имя, начинающееся с .., - не выход', () => {
        expect(() => fsx.confine(dir, path.join(dir, '..hidden'))).not.toThrow();
    });
});

describe('fsx.write', () => {
    it('создаёт каталоги, пишет и не оставляет tmp', async () => {
        const file = path.join(dir, 'x', 'y', 'f.txt');

        await fsx.write(file, 'данные');

        expect(await fs.readFile(file, 'utf8')).toBe('данные');
        expect(await fs.readdir(path.dirname(file))).toEqual(['f.txt']);
    });

    it('заменяет существующий файл', async () => {
        const file = path.join(dir, 'f.bin');
        await fsx.write(file, Buffer.from([1, 2]));

        await fsx.write(file, Buffer.from([3]));

        expect([...(await fs.readFile(file))]).toEqual([3]);
    });

    it('сбой записи - failed, tmp не остаётся', async () => {
        const blocker = path.join(dir, 'file');
        await fs.writeFile(blocker, '');

        await expect(fsx.write(path.join(blocker, 'f.txt'), 'x')).rejects.toMatchObject({ code: 'failed' });
        expect(await fs.readdir(dir)).toEqual(['file']);
    });
});

describe('fsx.json', () => {
    it('write -> read: круговой обмен', async () => {
        const file = path.join(dir, 'a.json');

        await fsx.json.write(file, { a: [1, 2], b: 'я' });

        expect(await fsx.json.read(file)).toEqual({ a: [1, 2], b: 'я' });
        expect(await fs.readFile(file, 'utf8')).toContain('\n    ');
    });

    it('нет файла - undefined', async () => {
        expect(await fsx.json.read(path.join(dir, 'none.json'))).toBeUndefined();
    });

    it('битый JSON - validation с именем файла', async () => {
        const file = path.join(dir, 'sources.json');
        await fs.writeFile(file, '{oops');

        await expect(fsx.json.read(file)).rejects.toMatchObject({
            code: 'validation',
            message: 'sources.json is corrupted',
        });
    });

    it('чтение каталога как файла - failed', async () => {
        await expect(fsx.json.read(dir)).rejects.toMatchObject({ code: 'failed' });
    });
});

describe('fsx.sha', () => {
    it('совпадает с git hash-object', () => {
        expect(fsx.sha(Buffer.from('hello\n'))).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
        expect(fsx.sha(Buffer.alloc(0))).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
    });
});

describe('fsx.isTemp', () => {
    it('узнаёт tmp записи', () => {
        expect(fsx.isTemp('a.ahk.0b1c.tmp')).toBe(true);
        expect(fsx.isTemp('a.ahk')).toBe(false);
    });
});

describe('fsx.exists', () => {
    it('true для файла, false для отсутствующего', async () => {
        const file = path.join(dir, 'a.txt');
        await fs.writeFile(file, 'x');

        expect(await fsx.exists(file)).toBe(true);
        expect(await fsx.exists(path.join(dir, 'none'))).toBe(false);
    });
});
