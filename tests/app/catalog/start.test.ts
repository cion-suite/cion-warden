import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const where = vi.hoisted(() => ({ dir: '' }));
const shell = vi.hoisted(() => ({ splash: { update: vi.fn() } }));

vi.mock('@app/shell', () => ({ shell }));
vi.mock('@app/utils/paths', () => ({ paths: { vault: () => `${where.dir}/nested/global_vault` } }));

import { startCatalog } from '@app/catalog/start';

beforeEach(async () => {
    where.dir = await fs.mkdtemp(path.join(os.tmpdir(), 'warden-catalog-'));
    shell.splash.update.mockReset();
});

afterEach(async () => {
    await fs.rm(where.dir, { recursive: true, force: true });
});

describe('startCatalog', () => {
    it('создаёт global_vault и обновляет статус splash', async () => {
        await startCatalog();

        expect((await fs.stat(path.join(where.dir, 'nested', 'global_vault'))).isDirectory()).toBe(true);
        expect(shell.splash.update).toHaveBeenCalledWith({ progress: 50, status: 'Registering handlers' });
    });

    it('повторный запуск при существующем каталоге не падает', async () => {
        await startCatalog();

        await expect(startCatalog()).resolves.toBeUndefined();
    });
});
