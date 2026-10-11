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

describe('schema.config.values', () => {
    it('ключ - имя переменной AHK, юникодные буквы допустимы', () => {
        for (const key of ['a', 'StartStopKey', '_x', 'a1_b', 'Клавиша']) {
            expect(ok(schema.config.values, { [key]: 'F1' })).toBe(true);
        }
    });

    it('отвергает пустой ключ, точку, пробел и цифру в начале', () => {
        for (const key of ['', 'a.b', 'a b', '1a', 'a-b', 'a;b']) {
            expect(ok(schema.config.values, { [key]: 'F1' })).toBe(false);
        }
    });

    it('отвергает имена прототипа в любом регистре', () => {
        for (const key of ['constructor', 'prototype', 'Constructor', 'PROTOTYPE', '__Proto__', '__PROTO__']) {
            expect(ok(schema.config.values, { [key]: 'x' })).toBe(false);
        }
    });

    // zod record молча отбрасывает свой ключ __proto__
    it('собственный ключ __proto__ не доходит до разобранных значений', () => {
        for (const input of [{ ['__proto__']: 'x' }, JSON.parse('{"__proto__":"x"}'), JSON.parse('{"__proto__":{"a":1}}')]) {
            const parsed = schema.config.values.safeParse(input);

            expect(!parsed.success || (!Object.hasOwn(parsed.data, '__proto__') && Object.keys(parsed.data).length === 0)).toBe(true);
        }
    });

    it('значение - конечное число или строка в одну строку', () => {
        expect(ok(schema.config.values, { a: 1, b: 'x', c: -1.5 })).toBe(true);
        for (const value of [true, false, null, undefined, { x: 1 }, ['a'], Number.NaN, Infinity, -Infinity, 'a\nb', 'a\rb']) {
            expect(ok(schema.config.values, { a: value })).toBe(false);
        }
    });

    it('0 и пустая строка валидны: пустой бинд допустим', () => {
        expect(ok(schema.config.values, { a: 0, b: '' })).toBe(true);
        expect(ok(schema.config.values, {})).toBe(true);
    });
});
