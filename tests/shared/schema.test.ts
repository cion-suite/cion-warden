import { describe, expect, it } from 'vitest';
import { schema } from '@shared/schema';

const ok = (s: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) => s.safeParse(v).success;

describe('schema.nonEmpty', () => {
    it('отвергает пустую строку и не-строки', () => {
        expect(schema.nonEmpty.safeParse('abc').success).toBe(true);
        for (const value of ['', undefined, null, 0]) expect(schema.nonEmpty.safeParse(value).success).toBe(false);
    });
});

describe('schema.source.id', () => {
    it('пропускает uuid и отвергает обход пути', () => {
        expect(ok(schema.source.id, '3f2b8c1e-aaaa-4bbb-8ccc-0123456789ab')).toBe(true);
        for (const value of ['', '..', 'a/b', 'a\\b', '..\\x', 'a b']) expect(ok(schema.source.id, value)).toBe(false);
    });
});

describe('schema.script.id', () => {
    it('принимает sha1-префикс из 16 hex', () => {
        expect(ok(schema.script.id, '0123456789abcdef')).toBe(true);
        for (const value of ['', '0123456789abcde', '0123456789ABCDEF', 'g123456789abcdef']) {
            expect(ok(schema.script.id, value)).toBe(false);
        }
    });
});

describe('schema.file.name', () => {
    it('пропускает обычное имя и отвергает метасимволы и сегменты пути', () => {
        expect(ok(schema.file.name, 'my script.ahk')).toBe(true);
        for (const value of ['', '.', '..', 'a/b.ahk', 'a\\b.ahk', 'pwn & calc.ahk', 'a;b', 'a`b', 'a\nb']) {
            expect(ok(schema.file.name, value)).toBe(false);
        }
    });
});

describe('schema.config.path', () => {
    it('требует .json', () => {
        expect(ok(schema.config.path, 'C:\\v\\id\\scripts\\cfg\\a.json')).toBe(true);
        expect(ok(schema.config.path, 'C:\\v\\id\\scripts\\a.ahk')).toBe(false);
    });
});

describe('schema.token', () => {
    it('обрезает пробелы и отвергает пустое', () => {
        expect(schema.token.parse('  ghp_x  ')).toBe('ghp_x');
        expect(ok(schema.token, '   ')).toBe(false);
    });
});

describe('schema.addSource', () => {
    const base = { type: 'git', url: 'https://github.com/o/r', branch: 'main', isPrivate: false };

    it('принимает полную форму, пустая ветка допустима', () => {
        expect(ok(schema.addSource, base)).toBe(true);
        expect(ok(schema.addSource, { ...base, branch: '' })).toBe(true);
    });

    it('отвергает чужой тип, пустой url, лишние поля, не-boolean', () => {
        expect(ok(schema.addSource, { ...base, type: 'svn' })).toBe(false);
        expect(ok(schema.addSource, { ...base, url: '' })).toBe(false);
        expect(ok(schema.addSource, { ...base, id: 'x' })).toBe(false);
        expect(ok(schema.addSource, { ...base, isPrivate: 'yes' })).toBe(false);
    });
});

describe('schema.updateSource', () => {
    it('частичный патч с allowlist полей', () => {
        expect(ok(schema.updateSource, {})).toBe(true);
        expect(ok(schema.updateSource, { branch: 'dev', isPrivate: true })).toBe(true);
        expect(ok(schema.updateSource, { type: 'git' })).toBe(false);
        expect(ok(schema.updateSource, { id: 'x' })).toBe(false);
        expect(ok(schema.updateSource, { url: '' })).toBe(false);
    });
});

describe('schema.script.values', () => {
    it('требует обе секции с примитивами', () => {
        expect(ok(schema.script.values, { hk: { a: 'F1' }, val: { n: 1, s: 'x', b: false } })).toBe(true);
        expect(ok(schema.script.values, { hk: {} })).toBe(false);
        expect(ok(schema.script.values, { hk: { a: 1 }, val: {} })).toBe(false);
        expect(ok(schema.script.values, { hk: {}, val: { o: {} } })).toBe(false);
    });
});

describe('schema.preset.values', () => {
    it('плоская карта примитивов', () => {
        expect(ok(schema.preset.values, { 'a.b': 1, 'a.c': 'x', 'd.e': true })).toBe(true);
        expect(ok(schema.preset.values, { 'a.b': null })).toBe(false);
        expect(ok(schema.preset.values, { 'a.b': { x: 1 } })).toBe(false);
    });

    it('ключ - section.field без имён прототипа', () => {
        for (const key of ['', 'a', '.b', 'a.', 'a..b', '__proto__.polluted', 'a.__proto__', 'constructor.x', 'a.prototype']) {
            expect(ok(schema.preset.values, { [key]: 'yes' })).toBe(false);
        }
        expect(ok(schema.preset.values, JSON.parse('{"__proto__.polluted":"yes"}'))).toBe(false);
        expect(ok(schema.preset.values, { 'a.b.c': 1 })).toBe(true);
    });
});
