import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const where = vi.hoisted(() => ({ vault: '' }));
const shell = vi.hoisted(() => ({ trashItem: vi.fn(), showItemInFolder: vi.fn() }));
const log = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock('electron', () => ({ shell }));
vi.mock('@app/utils/paths', () => ({ paths: { vault: () => where.vault } }));
vi.mock('@app/scripts', () => ({ scripts: {} }));
vi.mock('@app/scripts/processes', () => ({ processes: {} }));
vi.mock('@app/scripts/deps', () => ({ deps: {} }));
vi.mock('@cion-suite/core', async (importOriginal) => {
    const original = await importOriginal<typeof import('@cion-suite/core')>();
    return { ...original, logger: { ...original.logger, child: () => log } };
});

import { scriptsHandlers } from '@app/scripts/handlers';

type Entry = { args: unknown[]; handle: (...args: unknown[]) => Promise<unknown> | unknown };
const channel = (name: string) => (scriptsHandlers as unknown as Record<string, Entry>)[name]!;

let cfg: string;

beforeEach(async () => {
    where.vault = await fs.mkdtemp(path.join(os.tmpdir(), 'warden-scripts-'));
    cfg = path.join(where.vault, 's1', 'scripts', 'cfg', 'a.json');
    await fs.mkdir(path.dirname(cfg), { recursive: true });
    shell.trashItem.mockReset().mockResolvedValue(undefined);
    shell.showItemInFolder.mockReset();
    log.warn.mockReset();
});

afterEach(async () => {
    await fs.rm(where.vault, { recursive: true, force: true });
});

describe('scripts:delete', () => {
    it('в корзину - только внутри vault', async () => {
        const file = path.join(where.vault, 's1', 'scripts', 'a.ahk');

        await channel('scripts:delete').handle(file);

        expect(shell.trashItem).toHaveBeenCalledWith(file);
    });

    it.each([() => where.vault, () => path.join(where.vault, '..', 'x.ahk')])('вне vault или сам корень - validation', async (target) => {
        await expect(channel('scripts:delete').handle(target())).rejects.toMatchObject({ code: 'validation' });
        expect(shell.trashItem).not.toHaveBeenCalled();
    });

    it('сбой корзины - failed', async () => {
        shell.trashItem.mockRejectedValue(new Error('busy'));

        await expect(channel('scripts:delete').handle(path.join(where.vault, 's1', 'a.ahk')))
            .rejects.toMatchObject({ code: 'failed' });
    });
});

describe('scripts:folder:open', () => {
    it('открывает внутри vault, чужой путь - validation', () => {
        const file = path.join(where.vault, 's1', 'scripts', 'a.ahk');

        channel('scripts:folder:open').handle(file);
        expect(shell.showItemInFolder).toHaveBeenCalledWith(file);

        expect(() => channel('scripts:folder:open').handle(path.join(where.vault, '..', 'x'))).toThrow();
    });
});

describe('scripts:config', () => {
    const values = { hk: { run: 'F1' }, val: { fps: 60 } };

    it('save пишет в <cfg>.values.json, get читает', async () => {
        await channel('scripts:config:save').handle(cfg, values);

        expect(JSON.parse(await fs.readFile(cfg.replace(/\.json$/, '.values.json'), 'utf8'))).toEqual(values);
        await expect(channel('scripts:config:get').handle(cfg)).resolves.toEqual(values);
        await expect(fs.access(cfg)).rejects.toBeDefined();
    });

    it('нет файла - {}; битый - {} и warn', async () => {
        await expect(channel('scripts:config:get').handle(cfg)).resolves.toEqual({});

        await fs.writeFile(cfg.replace(/\.json$/, '.values.json'), '{oops');

        await expect(channel('scripts:config:get').handle(cfg)).resolves.toEqual({});
        expect(log.warn).toHaveBeenCalledTimes(1);
    });

    it('вне vault - validation', async () => {
        const outside = path.join(where.vault, '..', 'a.json');

        await expect(channel('scripts:config:get').handle(outside)).rejects.toMatchObject({ code: 'validation' });
        await expect(channel('scripts:config:save').handle(outside, values)).rejects.toMatchObject({ code: 'validation' });
    });

    it('схемы аргументов: .json обязателен, значения - строгий объект', () => {
        const [configPath] = channel('scripts:config:get').args as [{ safeParse: (v: unknown) => { success: boolean } }];
        const [, valuesSchema] = channel('scripts:config:save').args as [unknown, { safeParse: (v: unknown) => { success: boolean } }];

        expect(configPath.safeParse('a.values').success).toBe(false);
        expect(valuesSchema.safeParse({ hk: {}, val: {}, extra: 1 }).success).toBe(false);
        expect(valuesSchema.safeParse({ hk: { a: 'F1' }, val: { b: 1 } }).success).toBe(true);
    });
});
