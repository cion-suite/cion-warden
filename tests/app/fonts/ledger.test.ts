import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const where = vi.hoisted(() => ({ dir: '' }));

vi.mock('@app/utils/paths', () => ({ paths: { fonts: { index: () => `${where.dir}/installed-fonts.json` } } }));

import { ledger } from '@app/fonts/ledger';

beforeEach(async () => {
    where.dir = await fs.mkdtemp(path.join(os.tmpdir(), 'warden-ledger-'));
});

afterEach(async () => {
    await fs.rm(where.dir, { recursive: true, force: true });
});

describe('ledger.read', () => {
    it('нет файла или битый - пустой индекс', async () => {
        await expect(ledger.read()).resolves.toEqual({});

        await fs.writeFile(path.join(where.dir, 'installed-fonts.json'), '{oops');
        await expect(ledger.read()).resolves.toEqual({});
    });

    it('читает то, что записано', async () => {
        const index = { 'a:font:x.ttf': { assetId: 'a:font:x.ttf' } } as never;

        await ledger.write(index);

        await expect(ledger.read()).resolves.toEqual(index);
    });
});

describe('ledger.lock', () => {
    it('задачи идут строго по очереди, даже при отказе предыдущей', async () => {
        const order: string[] = [];
        const job = (name: string, ms: number, fail = false) => ledger.lock(async () => {
            order.push(`${name}:start`);
            await new Promise(resolve => setTimeout(resolve, ms));
            order.push(`${name}:end`);
            if (fail) throw new Error(name);
        });

        const results = await Promise.allSettled([job('a', 20, true), job('b', 1), job('c', 1)]);

        expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end']);
        expect(results.map(r => r.status)).toEqual(['rejected', 'fulfilled', 'fulfilled']);
    });

    it('возвращает результат задачи', async () => {
        await expect(ledger.lock(() => Promise.resolve(7))).resolves.toBe(7);
    });
});
