import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const where = vi.hoisted(() => ({ dir: '' }));

vi.mock('@app/utils/paths', () => ({
    paths: {
        source: (id: string) => ({ base: `${where.dir}/${id}` }),
    },
}));

import { catalog } from '@app/catalog';
import { fsx } from '@app/utils/fsx';

const { config } = catalog;
const BOM = '\u{FEFF}';
const REF = { sourceId: 'a', path: 'presets/p.ahk' };

const build = (eol: string, parts: { speed?: number; key?: string } = {}): string =>
    [
        '; @Title Main',
        '; @Bind',
        `Key := "${parts.key ?? 'F1'}" ; Open menu`,
        '; @Value',
        `Speed := ${parts.speed ?? 5}`,
        'Hidden := 42',
        '; my manual note',
        'Extra := "x"',
    ].join(eol);

const abs = (ref = REF): string => path.join(where.dir, ref.sourceId, ref.path);

const seed = async (text: string | Uint8Array, ref = REF): Promise<void> => {
    await fs.mkdir(path.dirname(abs(ref)), { recursive: true });
    await fs.writeFile(abs(ref), text);
};

const disk = (ref = REF): Promise<string> => fs.readFile(abs(ref), 'utf8');

beforeEach(async () => {
    where.dir = await fs.mkdtemp(path.join(os.tmpdir(), 'warden-config-'));
});

afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(where.dir, { recursive: true, force: true });
});

describe('config.read', () => {
    it('нет файла - null', async () => {
        expect(await config.read(REF)).toBeNull();
    });

    it('схема со значениями в field.value', async () => {
        await seed(build('\n'));

        const schema = await config.read(REF);

        expect(schema?.sections).toHaveLength(1);
        expect(schema?.sections[0]?.title).toBe('Main');
        expect(schema?.sections[0]?.fields).toMatchObject([
            { key: 'Key', type: 'hotkey', value: 'F1' },
            { key: 'Speed', type: 'number', value: 5 },
        ]);
    });

    it('путь указывает на каталог - failed', async () => {
        await fs.mkdir(abs(), { recursive: true });

        await expect(config.read(REF)).rejects.toMatchObject({ code: 'failed' });
    });
});

describe('config.path', () => {
    it('путь внутри корня источника', () => {
        expect(config.path(REF)).toBe(path.join(where.dir, 'a', 'presets/p.ahk'));
    });

    it.each(['../x.ahk', 'presets/../../x.ahk', '..', '.', ''])('%j - validation', (rel) => {
        expect(() => config.path({ sourceId: 'a', path: rel })).toThrow(expect.objectContaining({ code: 'validation' }));
    });

    // На POSIX path.join клеит абсолютный путь внутрь корня
    it.skipIf(process.platform !== 'win32')('абсолютный путь - validation', () => {
        const outside = path.resolve(where.dir, '..', 'outside.ahk');

        expect(() => config.path({ sourceId: 'a', path: outside })).toThrow(expect.objectContaining({ code: 'validation' }));
    });

    it('read, save и install не выходят за корень', async () => {
        const ref = { sourceId: 'a', path: '../x.ahk' };

        await expect(config.read(ref)).rejects.toMatchObject({ code: 'validation' });
        // save и install бросают синхронно: оборачиваем в async
        await expect((async () => config.save(ref, { Speed: 1 }))()).rejects.toMatchObject({ code: 'validation' });
        await expect((async () => config.install(ref, Buffer.from('A := 1')))()).rejects.toMatchObject({ code: 'validation' });
    });
});

describe('config.save', () => {
    it('нет файла - not_found, файл не создаётся', async () => {
        await expect(config.save(REF, { Speed: 9 })).rejects.toMatchObject({ code: 'not_found' });

        await expect(fs.access(abs())).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it.each([['LF', '\n'], ['CRLF', '\r\n']])('правит поле, остальное и EOL %s не трогает', async (_, eol) => {
        await seed(build(eol));

        await config.save(REF, { Speed: 9, Key: 'F5' });

        expect(await disk()).toBe(build(eol, { speed: 9, key: 'F5' }));
    });

    it('скрытая константа и ручные правки вне полей переживают', async () => {
        await seed(build('\n'));

        await config.save(REF, { Speed: 9, Hidden: 1, Extra: 'y' });

        const text = await disk();
        expect(text).toContain('Hidden := 42');
        expect(text).toContain('; my manual note');
        expect(text).toContain('Extra := "x"');
        expect(text).toContain('Speed := 9');
    });

    it('BOM сохраняется', async () => {
        await seed(BOM + build('\r\n'));

        await config.save(REF, { Speed: 9 });

        expect(await disk()).toBe(BOM + build('\r\n', { speed: 9 }));
    });

    it('нет финального перевода строки - не добавляется', async () => {
        await seed(build('\n'));
        expect((await disk()).endsWith('\n')).toBe(false);

        await config.save(REF, { Speed: 9 });

        expect((await disk()).endsWith('\n')).toBe(false);
    });

    it('финальный перевод строки сохраняется', async () => {
        await seed(`${build('\r\n')}\r\n`);

        await config.save(REF, { Speed: 9 });

        expect(await disk()).toBe(`${build('\r\n', { speed: 9 })}\r\n`);
    });

    it('незнакомые поля игнорируются', async () => {
        await seed(build('\n'));

        await config.save(REF, { Nope: 1, Speed: 9 });

        expect(await disk()).toBe(build('\n', { speed: 9 }));
    });

    it('ничего не изменилось - запись не делается', async () => {
        await seed(build('\n'));
        const write = vi.spyOn(fsx, 'write');

        await config.save(REF, { Speed: 5, Key: 'F1', Nope: 1 });

        expect(write).not.toHaveBeenCalled();
    });

    it('ничего не изменилось - mtime и файл прежние', async () => {
        await seed(build('\n'));
        const old = new Date(2020, 0, 1);
        await fs.utimes(abs(), old, old);

        await config.save(REF, { Speed: 5 });

        expect((await fs.stat(abs())).mtimeMs).toBe(old.getTime());
        expect(await disk()).toBe(build('\n'));
    });

    it('невалидное значение - validation, файл цел', async () => {
        await seed(build('\n'));

        await expect(config.save(REF, { Speed: Number.NaN })).rejects.toMatchObject({ code: 'validation' });
        await expect(config.save(REF, { Key: 'a\nb' })).rejects.toMatchObject({ code: 'validation' });

        expect(await disk()).toBe(build('\n'));
    });
});

describe('config.install', () => {
    it('нет файла - байты как есть, включая BOM', async () => {
        const bytes = Buffer.from(BOM + build('\r\n'), 'utf-8');

        await config.install(REF, bytes);

        expect(Buffer.from(await fs.readFile(abs())).equals(bytes)).toBe(true);
    });

    it('нет файла - каталоги создаются', async () => {
        const ref = { sourceId: 'new', path: 'presets/deep/p.ahk' };

        await config.install(ref, Buffer.from(build('\n')));

        expect(await disk(ref)).toBe(build('\n'));
    });

    it('есть файл - значения переносятся по имени', async () => {
        await seed(build('\n', { speed: 99, key: 'F9' }));

        await config.install(REF, Buffer.from(build('\n')));

        expect(await disk()).toBe(build('\n', { speed: 99, key: 'F9' }));
    });

    it('метаданные и состав берутся из нового, исчезнувшие значения отбрасываются', async () => {
        await seed(['; @Title Old', '; @Value', 'Gone := 7', '; @Value', 'Speed := 77'].join('\n'));
        const fresh = ['; @Title Fresh', '; @Value', 'Speed := 5', '; @Value', 'Added := 3 ; Added label'].join('\n');

        await config.install(REF, Buffer.from(fresh));

        const text = await disk();
        expect(text).toBe(['; @Title Fresh', '; @Value', 'Speed := 77', '; @Value', 'Added := 3 ; Added label'].join('\n'));
        expect(text).not.toContain('Gone');
    });

    it('BOM и EOL нового файла сохраняются при переносе', async () => {
        await seed(build('\n', { speed: 99 }));

        await config.install(REF, Buffer.from(BOM + build('\r\n')));

        expect(await disk()).toBe(BOM + build('\r\n', { speed: 99 }));
    });
});

describe('очередь на путь', () => {
    it('параллельные save разных полей не теряют правки', async () => {
        await seed(build('\n'));

        await Promise.all([config.save(REF, { Speed: 9 }), config.save(REF, { Key: 'F5' })]);

        expect(await disk()).toBe(build('\n', { speed: 9, key: 'F5' }));
    });

    it('много параллельных save разных полей', async () => {
        const names = Array.from({ length: 15 }, (_, i) => `V${i}`);
        await seed(names.flatMap((name) => ['; @Value', `${name} := 0`]).join('\n'));

        await Promise.all(names.map((name, i) => config.save(REF, { [name]: i + 1 })));

        const schema = await config.read(REF);
        expect(schema?.sections.flatMap((s) => s.fields.map((f) => f.value))).toEqual(names.map((_, i) => i + 1));
    });

    it('save, запущенный до install, не теряется после переноса', async () => {
        await seed(build('\n'));

        await Promise.all([
            config.save(REF, { Speed: 9 }),
            config.install(REF, Buffer.from(build('\n', { speed: 1, key: 'F2' }))),
        ]);

        expect(await disk()).toBe(build('\n', { speed: 9, key: 'F1' }));
    });

    it('save после install идёт по новому файлу', async () => {
        await seed(build('\n', { speed: 9 }));

        await Promise.all([
            config.install(REF, Buffer.from(build('\n', { speed: 1, key: 'F2' }))),
            config.save(REF, { Key: 'F7' }),
        ]);

        expect(await disk()).toBe(build('\n', { speed: 9, key: 'F7' }));
    });

    it('save и install вперемешку детерминированы', async () => {
        await seed(build('\n'));
        const fresh = Buffer.from(build('\n', { speed: 1, key: 'F2' }));

        await Promise.all([
            config.save(REF, { Speed: 6 }),
            config.install(REF, fresh),
            config.save(REF, { Key: 'F8' }),
            config.install(REF, fresh),
        ]);

        expect(await disk()).toBe(build('\n', { speed: 6, key: 'F8' }));
    });

    it('разные пути идут независимо', async () => {
        const other = { sourceId: 'a', path: 'presets/q.ahk' };
        await seed(build('\n'));
        await seed(build('\n'), other);

        await Promise.all([config.save(REF, { Speed: 1 }), config.save(other, { Speed: 2 })]);

        expect(await disk()).toBe(build('\n', { speed: 1 }));
        expect(await disk(other)).toBe(build('\n', { speed: 2 }));
    });

    it('не оставляет tmp-файлов', async () => {
        await seed(build('\n'));

        await Promise.all([config.save(REF, { Speed: 9 }), config.save(REF, { Key: 'F5' })]);

        expect(await fs.readdir(path.dirname(abs()))).toEqual(['p.ahk']);
    });
});

describe('сбой записи', () => {
    it('save: старый файл цел, ошибка наружу', async () => {
        await seed(build('\n'));
        vi.spyOn(fsx, 'write').mockRejectedValueOnce(new Error('disk full'));

        await expect(config.save(REF, { Speed: 9 })).rejects.toThrow('disk full');

        expect(await disk()).toBe(build('\n'));
    });

    it('install: старый файл цел', async () => {
        await seed(build('\n', { speed: 99 }));
        vi.spyOn(fsx, 'write').mockRejectedValueOnce(new Error('disk full'));

        await expect(config.install(REF, Buffer.from(build('\n')))).rejects.toThrow('disk full');

        expect(await disk()).toBe(build('\n', { speed: 99 }));
    });

    it('сбой не блокирует очередь: следующие задачи выполняются', async () => {
        await seed(build('\n'));
        vi.spyOn(fsx, 'write').mockRejectedValueOnce(new Error('disk full'));

        const failed = config.save(REF, { Speed: 9 });
        const next = config.save(REF, { Key: 'F5' });
        const last = config.install(REF, Buffer.from(build('\n', { speed: 1 })));

        await expect(failed).rejects.toThrow('disk full');
        await next;
        await last;
        expect(await disk()).toBe(build('\n', { key: 'F5' }));
    });

    it('сбой rename внутри fsx.write: failed, файл цел, tmp убран', async () => {
        await seed(build('\n'));
        vi.spyOn(fs, 'rename').mockRejectedValueOnce(Object.assign(new Error('EPERM'), { code: 'EPERM' }));

        await expect(config.save(REF, { Speed: 9 })).rejects.toMatchObject({ code: 'failed' });

        expect(await disk()).toBe(build('\n'));
        expect(await fs.readdir(path.dirname(abs()))).toEqual(['p.ahk']);
        await config.save(REF, { Speed: 9 });
        expect(await disk()).toBe(build('\n', { speed: 9 }));
    });
});
