// Список скриптов: tmp атомарной записи (fsx.write) не скрипт.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const where = vi.hoisted(() => ({ vault: '' }));

vi.mock('@app/utils/paths', () => ({
    paths: {
        vault: () => where.vault,
        source: (id: string) => ({ scripts: `${where.vault}/${id}/scripts` }),
    },
}));

import { scripts } from '@app/scripts';

beforeEach(async () => {
    where.vault = await fs.mkdtemp(path.join(os.tmpdir(), 'warden-list-'));
    await fs.mkdir(path.join(where.vault, 's1', 'scripts'), { recursive: true });
});

afterEach(async () => {
    await fs.rm(where.vault, { recursive: true, force: true });
});

describe('scripts.list', () => {
    it('пропускает tmp записи и оставляет настоящие скрипты', async () => {
        const dir = path.join(where.vault, 's1', 'scripts');
        await fs.writeFile(path.join(dir, 'a.ahk'), '');
        await fs.writeFile(path.join(dir, 'a.ahk.0b1c.tmp'), '');
        expect((await scripts.list()).map(s => s.name)).toEqual(['a']);
    });
});
