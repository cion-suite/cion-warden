// Дерево репозитория: что попадает в manifest, что нет.
import { describe, expect, it } from 'vitest';
import { derive } from '@app/catalog/derive';
import type { GithubTreeEntry } from '@app/github/types';

const blob = (path: string, sha = `sha:${path}`): GithubTreeEntry =>
    ({ path, mode: '100644', type: 'blob', sha, url: '' });
const folder = (path: string): GithubTreeEntry => ({ path, mode: '040000', type: 'tree', sha: `sha:${path}`, url: '' });

const source = { id: 'a', type: 'git', name: 'o/r', url: 'https://github.com/o/r', branch: 'feature/x y', isPrivate: false } as const;
const to = derive.links(source);

describe('derive.links', () => {
    it('кодирует сегменты ветки и пути, слеши остаются', () => {
        expect(to.raw('lib/a b.ahk')).toBe('https://raw.githubusercontent.com/o/r/feature/x%20y/lib/a%20b.ahk');
        expect(to.blob('lib/a.ahk')).toBe('https://github.com/o/r/blob/feature/x%20y/lib/a.ahk');
        expect(to.tree('lib/dir')).toBe('https://github.com/o/r/tree/feature/x%20y/lib/dir');
    });

    it('не GitHub - validation', () => {
        expect(() => derive.links({ ...source, url: 'https://gitlab.com/o/r' }))
            .toThrowError(expect.objectContaining({ code: 'validation' }));
    });

    it('пустая ветка - main', () => {
        expect(derive.links({ ...source, branch: '' }).raw('a')).toContain('/o/r/main/a');
    });
});

describe('derive.scripts', () => {
    it('скрипты и cfg раздельно, по имени, без вложенных путей', () => {
        const tree = [
            blob('scripts/b.ahk'),
            blob('scripts/a.ahk'),
            blob('scripts/cfg/a.json'),
            blob('scripts/deep/x.ahk'),
            blob('scripts/cfg/deep/y.json'),
            blob('README.md'),
            folder('scripts/cfg'),
        ];

        const { scripts, cfgs } = derive.scripts(tree, to);

        expect(scripts.map(s => s.fileName)).toEqual(['a.ahk', 'b.ahk']);
        expect(cfgs.map(c => c.fileName)).toEqual(['a.json']);
        expect(scripts[0]).toMatchObject({ sha: 'sha:scripts/a.ahk', downloadUrl: expect.stringContaining('/scripts/a.ahk') });
    });

    it('имена с метасимволами cmd не попадают в manifest', () => {
        const tree = [blob('scripts/pwn & calc.ahk'), blob('scripts/a(1).ahk'), blob('scripts/ok.ahk'), blob('scripts/cfg/x;y.json')];

        const { scripts, cfgs } = derive.scripts(tree, to);

        expect(scripts.map(s => s.fileName)).toEqual(['ok.ahk']);
        expect(cfgs).toEqual([]);
    });
});

describe('derive.presets', () => {
    it('только json, values.json исключён', () => {
        const tree = [blob('presets/b.json'), blob('presets/a.JSON'), blob('presets/a.values.json'), blob('presets/x.txt'), blob('presets/d/e.json')];

        expect(derive.presets(tree, to).map(p => p.fileName)).toEqual(['a.JSON', 'b.json']);
    });
});

describe('derive.libs', () => {
    it('файл - lib без расширения, папка - lib с файлами', () => {
        const tree = [
            blob('lib/util.ahk'),
            folder('lib/pack'),
            blob('lib/pack/a.ahk'),
            blob('lib/pack/sub/b.ahk'),
        ];

        const libs = derive.libs(tree, to);

        expect(libs.map(l => [l.name, l.kind])).toEqual([['pack', 'folder'], ['util', 'file']]);
        expect(libs[0]!.files.map(f => f.path)).toEqual(['pack/a.ahk', 'pack/sub/b.ahk']);
        expect(libs[0]!.webUrl).toContain('/tree/');
        expect(libs[1]!.webUrl).toContain('/blob/');
        expect(libs[1]!.files).toEqual([{ path: 'util.ahk', sha: 'sha:lib/util.ahk', downloadUrl: to.raw('lib/util.ahk') }]);
    });

    it('файл и папка с одним именем: файл сохраняет расширение', () => {
        const tree = [blob('lib/pack.ahk'), folder('lib/pack'), blob('lib/pack/a.ahk')];

        expect(derive.libs(tree, to).map(l => l.name)).toEqual(['pack', 'pack.ahk']);
    });

    it('папка без tree-записи берёт sha первого файла', () => {
        const libs = derive.libs([blob('lib/pack/a.ahk', 'x')], to);

        expect(libs).toMatchObject([{ name: 'pack', kind: 'folder', sha: 'x' }]);
    });
});

describe('derive.sidecar.parse', () => {
    const parse = (value: unknown) => derive.sidecar.parse(Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)));

    it('нет содержимого или не json - null', () => {
        expect(derive.sidecar.parse(null)).toBeNull();
        expect(parse('{oops')).toBeNull();
        expect(parse({ fonts: 'x' })).toBeNull();
        expect(parse('null')).toBeNull();
    });

    it('отбрасывает небезопасные имена файлов и лица', () => {
        const parsed = parse({
            fonts: [
                { file: 'ok.ttf', face: ' Fancy ' },
                { file: '../evil.ttf' },
                { file: 'a&b.ttf' },
                { file: 'bad.ttf', face: 'a\\b' },
                { file: 'bad2.ttf', face: 'a"b' },
                { file: 'num.ttf', face: 5 },
                { file: 'skip.ttf', skip: true },
                null,
                'x',
            ],
        });

        expect(parsed).toEqual({
            fonts: [
                { file: 'ok.ttf', face: 'Fancy', skip: undefined },
                { file: 'skip.ttf', skip: true },
            ],
        });
    });
});

describe('derive.fonts', () => {
    const tree = [
        blob('assets/fonts/B-Bold.otf'),
        blob('assets/fonts/a_regular.ttf'),
        blob('assets/fonts/old.fon'),
        blob('assets/fonts/_fonts.json'),
        blob('assets/fonts/readme.txt'),
        blob('assets/fonts/sub/c.ttf'),
        blob('assets/fonts/bad&name.ttf'),
    ];

    it('расширения шрифтов, лицо из имени файла, .fon помечен skip', () => {
        const fonts = derive.fonts(tree, null, to);

        expect(fonts.map(f => [f.fileName, f.face, f.skip])).toEqual([
            ['B-Bold.otf', 'B Bold', undefined],
            ['a_regular.ttf', 'a regular', undefined],
            ['old.fon', 'old', true],
        ]);
    });

    it('sidecar задаёт лицо и skip без учёта регистра имени', () => {
        const sidecar = { fonts: [{ file: 'b-bold.OTF', face: 'Brand Bold' }, { file: 'a_regular.ttf', skip: true }] };

        const fonts = derive.fonts(tree, sidecar, to);

        expect(fonts.find(f => f.fileName === 'B-Bold.otf')?.face).toBe('Brand Bold');
        expect(fonts.find(f => f.fileName === 'a_regular.ttf')?.skip).toBe(true);
    });
});
