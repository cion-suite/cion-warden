import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const where = vi.hoisted(() => ({ file: '' }));

vi.mock('@app/utils/paths', () => ({ paths: { sources: () => where.file } }));

import { store } from '@app/sources/store';

let dir: string;

beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'warden-sources-'));
    where.file = path.join(dir, 'sources.json');
});

afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});

const git = { id: 'a', type: 'git', name: 'o/r', url: 'https://github.com/o/r', branch: 'main', isPrivate: false };
const seed = (data: unknown) => fs.writeFile(where.file, typeof data === 'string' ? data : JSON.stringify(data));
const saved = async () => JSON.parse(await fs.readFile(where.file, 'utf8')) as unknown[];

describe('store.list', () => {
    it('нет файла - пустой список', async () => {
        await expect(store.list()).resolves.toEqual([]);
    });

    it('битый файл - validation, и файл не тронут', async () => {
        await seed('{oops');

        await expect(store.list()).rejects.toMatchObject({ code: 'validation', message: 'sources.json is corrupted' });
        await expect(store.add({ type: 'git', url: 'https://github.com/o/x', branch: 'main', isPrivate: false }))
            .rejects.toMatchObject({ code: 'validation' });
        expect(await fs.readFile(where.file, 'utf8')).toBe('{oops');
    });

    it('не массив - []; записи не git отбрасываются', async () => {
        await seed({ a: 1 });
        await expect(store.list()).resolves.toEqual([]);

        await seed([git, { ...git, id: 'b', type: 'external' }, null, 'x']);
        await expect(store.list()).resolves.toEqual([git]);
    });
});

describe('store.get', () => {
    it('находит запись, иначе not_found', async () => {
        await seed([git]);

        await expect(store.get('a')).resolves.toEqual(git);
        await expect(store.get('zzz')).rejects.toMatchObject({ code: 'not_found' });
    });
});

describe('store.add', () => {
    it('id - uuid, имя выводится из url, токена в записи нет', async () => {
        const added = await store.add({ type: 'git', url: 'https://github.com/Owner/Repo.git', branch: 'dev', isPrivate: true });

        expect(added).toMatchObject({ type: 'git', name: 'Owner/Repo', branch: 'dev', isPrivate: true });
        expect(added.id).toMatch(/^[\w-]{36}$/);
        expect(added).not.toHaveProperty('tokenMask');
        expect(await saved()).toEqual([added]);
    });

    it('дописывает к существующим', async () => {
        await seed([git]);

        await store.add({ type: 'git', url: 'https://github.com/o/x', branch: 'main', isPrivate: false });

        expect(await saved()).toHaveLength(2);
    });
});

describe('store.update', () => {
    it('меняет только присланные поля, undefined не затирает', async () => {
        await seed([git]);

        const updated = await store.update('a', { branch: 'dev', isPrivate: undefined });

        expect(updated).toEqual({ ...git, branch: 'dev' });
        expect(await saved()).toEqual([{ ...git, branch: 'dev' }]);
    });

    it('смена url пересчитывает имя, ручной name не живёт', async () => {
        await seed([git]);

        const updated = await store.update('a', { url: 'https://github.com/n/m', name: 'Моё' });

        expect(updated.name).toBe('n/m');
    });

    it('без url имя из патча остаётся', async () => {
        await seed([git]);

        expect((await store.update('a', { name: 'Моё' })).name).toBe('Моё');
    });

    it('неизвестный id - not_found', async () => {
        await seed([git]);

        await expect(store.update('zzz', { branch: 'x' })).rejects.toMatchObject({ code: 'not_found' });
    });
});

describe('store.remove', () => {
    it('убирает запись, остальные остаются', async () => {
        await seed([git, { ...git, id: 'b' }]);

        await store.remove('a');

        expect(await saved()).toEqual([{ ...git, id: 'b' }]);
    });

    it('неизвестный id - not_found, файл не перезаписан', async () => {
        await seed([git]);
        const before = await fs.readFile(where.file, 'utf8');

        await expect(store.remove('zzz')).rejects.toMatchObject({ code: 'not_found' });
        expect(await fs.readFile(where.file, 'utf8')).toBe(before);
    });
});

describe('store.seed', () => {
    it('первый запуск: источник по умолчанию', async () => {
        await store.seed();

        expect(await saved()).toEqual([
            expect.objectContaining({
                type: 'git',
                name: 'Lazy-World/wf-macro',
                url: 'https://github.com/Lazy-World/wf-macro',
                branch: 'main',
                isPrivate: false,
            }),
        ]);
    });

    it('файл есть - не трогает, в том числе пустой список и битый файл', async () => {
        for (const content of ['[]', '{oops']) {
            await seed(content);
            await store.seed();
            expect(await fs.readFile(where.file, 'utf8')).toBe(content);
        }
    });
});
