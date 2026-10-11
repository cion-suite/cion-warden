import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

    it('сбой уборки tmp не подменяет причину', async () => {
        const blocker = path.join(dir, 'file');
        await fs.writeFile(blocker, '');
        // На Linux путь внутри файла даёт ENOTDIR, а не ENOENT
        const rm = vi.spyOn(fs, 'rm').mockRejectedValueOnce(Object.assign(new Error('ENOTDIR'), { code: 'ENOTDIR' }));

        try {
            await expect(fsx.write(path.join(blocker, 'f.txt'), 'x')).rejects.toMatchObject({ code: 'failed' });
            expect(rm).toHaveBeenCalledTimes(1);
        } finally {
            rm.mockRestore();
        }
    });
});

describe('fsx.text', () => {
    it('читает как есть, BOM остаётся', async () => {
        const file = path.join(dir, 'a.ahk');
        await fs.writeFile(file, '\uFEFFa = 1\r\n');

        expect(await fsx.text.read(file)).toBe('\uFEFFa = 1\r\n');
    });

    it('нет файла - undefined, каталог вместо файла - failed', async () => {
        expect(await fsx.text.read(path.join(dir, 'none.ahk'))).toBeUndefined();
        await expect(fsx.text.read(dir)).rejects.toMatchObject({ code: 'failed' });
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

describe('fsx.isMissing', () => {
    it('true только для ENOENT', () => {
        expect(fsx.isMissing(Object.assign(new Error('x'), { code: 'ENOENT' }))).toBe(true);
        expect(fsx.isMissing(Object.assign(new Error('x'), { code: 'EACCES' }))).toBe(false);
        expect(fsx.isMissing(new Error('x'))).toBe(false);
    });

    it('узнаёт реальную ошибку чтения отсутствующего файла', async () => {
        const err = await fs.readFile(path.join(dir, 'none')).catch((e: unknown) => e);

        expect(fsx.isMissing(err)).toBe(true);
    });
});

describe('fsx.queue', () => {
    const tick = (ms = 5) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    it('возвращает значение задачи', async () => {
        expect(await fsx.queue('k', () => Promise.resolve(42))).toBe(42);
    });

    it('задачи одного ключа идут строго по порядку', async () => {
        const order: string[] = [];
        const job = (name: string, ms: number) => async () => {
            order.push(`${name}:start`);
            await tick(ms);
            order.push(`${name}:end`);
        };

        await Promise.all([
            fsx.queue('k', job('a', 20)),
            fsx.queue('k', job('b', 1)),
            fsx.queue('k', job('c', 1)),
        ]);

        expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end']);
    });

    it('разные ключи идут параллельно', async () => {
        const order: string[] = [];
        let release = (): void => undefined;
        const gate = new Promise<void>((resolve) => { release = resolve; });

        const slow = fsx.queue('one', async () => {
            order.push('one:start');
            await gate;
            order.push('one:end');
        });
        const fast = fsx.queue('two', async () => {
            order.push('two');
        });

        await fast;
        expect(order).toEqual(['one:start', 'two']);

        release();
        await slow;
        expect(order).toEqual(['one:start', 'two', 'one:end']);
    });

    it('сбой задачи пробрасывается своему вызывающему', async () => {
        await expect(fsx.queue('k', () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    });

    it('сбой задачи не блокирует следующую и не ломает её результат', async () => {
        const failed = fsx.queue('k', async () => {
            await tick();
            throw new Error('boom');
        });
        const next = fsx.queue('k', () => Promise.resolve('ok'));

        await expect(failed).rejects.toThrow('boom');
        await expect(next).resolves.toBe('ok');
    });

    it('синхронный throw в задаче - отказ, очередь жива', async () => {
        const failed = fsx.queue('k', () => { throw new Error('sync'); });

        await expect(failed).rejects.toThrow('sync');
        await expect(fsx.queue('k', () => Promise.resolve(1))).resolves.toBe(1);
    });

    it('после опустошения очереди тот же ключ работает снова', async () => {
        await fsx.queue('k', () => Promise.resolve(1));
        await tick();

        await expect(fsx.queue('k', () => Promise.resolve(2))).resolves.toBe(2);
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
