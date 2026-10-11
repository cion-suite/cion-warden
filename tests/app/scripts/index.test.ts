// Список скриптов: tmp атомарной записи (fsx.write) не скрипт.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const where = vi.hoisted(() => ({ vault: '' }));
const log = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock('@app/utils/paths', () => ({
    paths: {
        vault: () => where.vault,
        source: (id: string) => ({ base: `${where.vault}/${id}`, scripts: `${where.vault}/${id}/scripts` }),
    },
}));

vi.mock('@cion-suite/core', async (importOriginal) => {
    const original = await importOriginal<typeof import('@cion-suite/core')>();
    return { ...original, logger: { ...original.logger, child: () => log } };
});

import { scripts } from '@app/scripts';

beforeEach(async () => {
    where.vault = await fs.mkdtemp(path.join(os.tmpdir(), 'warden-list-'));
    await fs.mkdir(path.join(where.vault, 's1', 'scripts'), { recursive: true });
    log.warn.mockReset();
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

    it('вложенные каталоги (cfg, misc) не скрипты', async () => {
        const dir = path.join(where.vault, 's1', 'scripts');
        await fs.mkdir(path.join(dir, 'cfg'), { recursive: true });
        await fs.mkdir(path.join(dir, 'misc'), { recursive: true });
        await fs.writeFile(path.join(dir, 'a.ahk'), '');
        await fs.writeFile(path.join(dir, 'cfg', 'cfg_a.ahk'), '');
        await fs.writeFile(path.join(dir, 'misc', 'misc.ahk'), '');

        expect((await scripts.list()).map(s => s.name)).toEqual(['a']);
    });
});

describe('scripts.list: config', () => {
    const cfg = (name: string, text: string) =>
        fs.mkdir(path.join(where.vault, 's1', 'scripts', 'cfg'), { recursive: true })
            .then(() => fs.writeFile(path.join(where.vault, 's1', 'scripts', 'cfg', name), text));
    const script = (name: string) => fs.writeFile(path.join(where.vault, 's1', 'scripts', name), '');

    it('поля cfg_<файл> со значениями из рабочего файла', async () => {
        await script('a.ahk');
        await cfg('cfg_a.ahk', '; @Title Keys\n; @Bind\nKey = F1 ; Run\n');

        const [found] = await scripts.list();

        expect(found?.config).toEqual({
            sections: [{ title: 'Keys', fields: [{ key: 'Key', label: 'Run', type: 'hotkey', value: 'F1' }] }],
        });
    });

    it('нет cfg или в нём нет полей - config не задан, без warn', async () => {
        await script('a.ahk');
        await script('b.ahk');
        await cfg('cfg_b.ahk', '; just a comment\nSetBatchLines -1\n');

        const found = await scripts.list();

        expect(found.map(item => item.config)).toEqual([undefined, undefined]);
        expect(log.warn).not.toHaveBeenCalled();
    });

    it('нечитаемый cfg - warn, список целый', async () => {
        await script('a.ahk');
        await fs.mkdir(path.join(where.vault, 's1', 'scripts', 'cfg', 'cfg_a.ahk'), { recursive: true });

        const found = await scripts.list();

        expect(found.map(item => item.name)).toEqual(['a']);
        expect(found[0]?.config).toBeUndefined();
        expect(log.warn).toHaveBeenCalledTimes(1);
    });
});

describe('scripts.config.ref', () => {
    it('id из list -> источник и cfg_<файл>', async () => {
        await fs.writeFile(path.join(where.vault, 's1', 'scripts', 'a.ahk'), '');
        const [found] = await scripts.list();

        expect(scripts.config.ref(found!.id)).toEqual({ sourceId: 's1', path: 'scripts/cfg/cfg_a.ahk' });
    });

    it('неизвестный id - not_found', () => {
        expect(() => scripts.config.ref('0123456789abcdef')).toThrow(expect.objectContaining({ code: 'not_found' }));
    });
});
