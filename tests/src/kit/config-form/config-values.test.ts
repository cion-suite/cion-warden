import { describe, expect, it } from 'vitest';
import type { ConfigSchema } from '@shared/types';

import { configValues } from '@/kit/config-form/config-values';

const schema: ConfigSchema = {
    sections: [
        {
            title: 'Keys',
            fields: [
                { key: 'keys_jump', label: 'Jump', type: 'hotkey', value: 'Space' },
                { key: 'keys_name', label: 'Name', type: 'string', value: 'hero' },
            ],
        },
        { title: 'Empty', fields: [] },
        { title: '', fields: [{ key: 'tune_speed', label: 'Speed', type: 'number', value: 0 }] },
    ],
};

describe('configValues.split', () => {
    it('hotkey - в binds, остальное - в values, заголовки сохраняются', () => {
        const { values, binds } = configValues.split(schema);
        expect(binds.map((s) => [s.title, s.fields.map((f) => f.key)])).toEqual([['Keys', ['keys_jump']]]);
        expect(values.map((s) => [s.title, s.fields.map((f) => f.key)])).toEqual([
            ['Keys', ['keys_name']],
            ['', ['tune_speed']],
        ]);
    });

    it('пустые секции выпадают', () => {
        const { values, binds } = configValues.split(schema);
        expect([...values, ...binds].some((s) => s.title === 'Empty')).toBe(false);
    });

    it('нет hotkey - binds пуст', () => {
        const plain: ConfigSchema = { sections: [{ title: '', fields: [schema.sections[0].fields[1]] }] };
        expect(configValues.split(plain).binds).toEqual([]);
    });

    it('только hotkey - values пуст', () => {
        const keys: ConfigSchema = { sections: [{ title: '', fields: [schema.sections[0].fields[0]] }] };
        expect(configValues.split(keys).values).toEqual([]);
    });
});

describe('configValues.fields', () => {
    it('собирает поля всех секций, включая секцию без заголовка', () => {
        expect(configValues.fields(schema).map((f) => f.key)).toEqual(['keys_jump', 'keys_name', 'tune_speed']);
    });

    it('без схемы - пусто', () => {
        expect(configValues.fields(null)).toEqual([]);
    });
});

describe('configValues.saved', () => {
    it('значения полей как в файле, включая 0', () => {
        expect(configValues.saved(schema)).toEqual({ keys_jump: 'Space', keys_name: 'hero', tune_speed: 0 });
    });

    it('без схемы - пусто', () => {
        expect(configValues.saved(null)).toEqual({});
    });
});

describe('configValues.equal', () => {
    it('равны по ключам и значениям', () => {
        expect(configValues.equal({ a: 1, b: 'x' }, { b: 'x', a: 1 })).toBe(true);
    });

    it('разные значения или набор ключей', () => {
        expect(configValues.equal({ a: 1 }, { a: 2 })).toBe(false);
        expect(configValues.equal({ a: 1 }, { a: 1, b: 2 })).toBe(false);
        expect(configValues.equal({ a: 1 }, { b: 1 })).toBe(false);
    });

    it('строка и число не равны', () => {
        expect(configValues.equal({ a: 1 }, { a: '1' })).toBe(false);
    });
});
