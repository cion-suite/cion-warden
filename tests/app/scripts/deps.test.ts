import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const where = vi.hoisted(() => ({ vault: '' }));
const read = vi.hoisted(() => vi.fn());
const github = vi.hoisted(() => ({ file: vi.fn() }));
const store = vi.hoisted(() => ({ list: vi.fn() }));
const known = vi.hoisted(() => ({ files: new Map<string, string>() }));

vi.mock('@app/utils/paths', () => ({
    paths: {
        vault: () => where.vault,
        source: (id: string) => {
            const base = path.join(where.vault, id);
            return { base, lib: path.join(base, 'lib'), presets: path.join(base, 'presets') };
        },
    },
}));
vi.mock('@app/catalog', async (importOriginal) => {
    const original = await importOriginal<typeof import('@app/catalog')>();
    return { catalog: { ...original.catalog, manifest: { ...original.catalog.manifest, read } } };
});
vi.mock('@app/github', () => ({ github }));
vi.mock('@app/sources/store', () => ({ store }));
vi.mock('@app/scripts', () => ({
    scripts: {
        path: (id: string) => {
            const file = known.files.get(id);
            if (file === undefined) throw Object.assign(new Error('not found'), { code: 'not_found' });
            return file;
        },
    },
}));

import { deps } from '@app/scripts/deps';

const source = { id: 's1', type: 'git', name: 'o/r', url: 'https://github.com/o/r', branch: 'main', isPrivate: false };
const lib = (name: string, file = `${name}.ahk`) => ({ name, kind: 'file', path: file, sha: 'x', files: [{ path: file, sha: 'x', downloadUrl: null }] });
const entry = (fileName: string) => ({ fileName, sha: 'x', downloadUrl: null });
const base = { libs: [], presets: [], cfgs: [], support: [] };

let script: string;

beforeEach(async () => {
    where.vault = await fs.mkdtemp(path.join(os.tmpdir(), 'warden-deps-'));
    script = path.join(where.vault, 's1', 'scripts', 'main.ahk');
    await fs.mkdir(path.dirname(script), { recursive: true });
    known.files = new Map([['0123456789abcdef', script]]);
    store.list.mockReset().mockResolvedValue([source]);
    github.file.mockReset().mockResolvedValue(Buffer.from(''));
    read.mockReset();
});

afterEach(async () => {
    await fs.rm(where.vault, { recursive: true, force: true });
});

describe('deps.get', () => {
    it('нет manifest - пусто', async () => {
        read.mockResolvedValue(null);
        await fs.writeFile(script, '#Include lib\\a.ahk');

        await expect(deps.get('0123456789abcdef')).resolves.toEqual({ missing: [], unknown: [] });
    });

    it('неизвестный id - not_found', async () => {
        await expect(deps.get('ffffffffffffffff')).rejects.toMatchObject({ code: 'not_found' });
    });

    it('источника нет в списке - пусто', async () => {
        store.list.mockResolvedValue([]);

        await expect(deps.get('0123456789abcdef')).resolves.toEqual({ missing: [], unknown: [] });
    });

    it('libs по #Include, имени файла и пресеты по имени', async () => {
        read.mockResolvedValue({
            ...base,
            libs: [lib('a'), lib('b'), lib('cfgdata', 'cfgdata.json'), lib('ok')],
            presets: [entry('Binds.json'), entry('have.json')],
        });
        await fs.writeFile(script, [
            '#Include lib\\a.ahk',
            '#Include <Func>',
            '#Include lib\\ok.ahk',
            '#Include lib\\zzz.ahk',
            'Cfg.FromFile("cfgdata.json")',
            'Load("binds.JSON")',
            'Load("have.json")',
        ].join('\n'));
        await fs.mkdir(path.join(where.vault, 's1', 'lib'), { recursive: true });
        await fs.writeFile(path.join(where.vault, 's1', 'lib', 'ok.ahk'), '');
        await fs.mkdir(path.join(where.vault, 's1', 'presets'), { recursive: true });
        await fs.writeFile(path.join(where.vault, 's1', 'presets', 'have.json'), '{}');
        // a.ahk есть в репо и тянет b.ahk
        github.file.mockImplementation(async (_source: unknown, repoPath: string) =>
            Buffer.from(repoPath === 'lib/a.ahk' ? '#Include b.ahk' : ''));

        const result = await deps.get('0123456789abcdef');

        expect(result.unknown).toEqual(['lib\\zzz.ahk']);
        expect(result.missing).toEqual([
            { kind: 'lib', sourceId: 's1', libId: 's1:lib:a', name: 'a' },
            { kind: 'lib', sourceId: 's1', libId: 's1:lib:b', name: 'b' },
            { kind: 'lib', sourceId: 's1', libId: 's1:lib:cfgdata', name: 'cfgdata' },
            { kind: 'preset', sourceId: 's1', presetId: 's1:preset:Binds.json', name: 'Binds' },
        ]);
    });

    it('include с *i, presets, support, cfg и % не попадают в unknown', async () => {
        read.mockResolvedValue({
            ...base,
            support: [entry('misc/misc.ahk'), entry('Misc/Deep/Tool.ahk')],
            cfgs: [entry('cfg_main.ahk')],
        });
        await fs.writeFile(script, [
            '#Include *i misc\\misc.ahk',
            '#Include %A_ScriptDir%\\MISC\\deep\\tool.ahk',
            '#Include ./misc/misc.ahk',
            '#Include cfg\\cfg_%A_Scriptname%',
            '#Include cfg\\cfg_main.ahk',
            '#Include ..\\presets\\game.ahk',
            '#Include *i presets\\game.ahk',
            '#Include %A_ScriptDir%\\..\\presets\\game.ahk',
            '#Include misc\\other.ahk',
            '#Include ..\\misc\\misc.ahk',
        ].join('\n'));

        const result = await deps.get('0123456789abcdef');

        expect(result).toEqual({ missing: [], unknown: ['misc\\other.ahk'] });
    });

    it('пресет .ahk ищется по имени файла в тексте', async () => {
        read.mockResolvedValue({ ...base, presets: [entry('game_settings.ahk'), entry('other.ahk')] });
        await fs.writeFile(script, 'Load("Presets\\Game_Settings.ahk")');
        await fs.mkdir(path.join(where.vault, 's1', 'presets'), { recursive: true });

        await expect(deps.get('0123456789abcdef')).resolves.toEqual({
            missing: [{ kind: 'preset', sourceId: 's1', presetId: 's1:preset:game_settings.ahk', name: 'game_settings' }],
            unknown: [],
        });

        await fs.writeFile(path.join(where.vault, 's1', 'presets', 'game_settings.ahk'), '');
        await expect(deps.get('0123456789abcdef')).resolves.toEqual({ missing: [], unknown: [] });
    });

    it('отказ GitHub при чтении lib пробрасывается', async () => {
        read.mockResolvedValue({ ...base, libs: [lib('a')] });
        await fs.writeFile(script, '#Include lib\\a.ahk');
        github.file.mockRejectedValue(Object.assign(new Error('rate'), { code: 'rate_limited' }));

        await expect(deps.get('0123456789abcdef')).rejects.toMatchObject({ code: 'rate_limited' });
    });
});
