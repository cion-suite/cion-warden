import { describe, expect, it } from 'vitest';
import type { ConfigSchema } from '@shared/types';

import { presetValues } from '@/entities/bind/form/preset-values';

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

describe('presetValues.fields', () => {
    it('собирает поля всех секций, включая секцию без заголовка', () => {
        expect(presetValues.fields(schema).map((f) => f.key)).toEqual(['keys_jump', 'keys_name', 'tune_speed']);
    });

    it('без схемы - пусто', () => {
        expect(presetValues.fields(null)).toEqual([]);
    });
});

describe('presetValues.saved', () => {
    it('значения полей как в файле, включая 0', () => {
        expect(presetValues.saved(schema)).toEqual({ keys_jump: 'Space', keys_name: 'hero', tune_speed: 0 });
    });

    it('без схемы - пусто', () => {
        expect(presetValues.saved(null)).toEqual({});
    });
});

describe('presetValues.equal', () => {
    it('равны по ключам и значениям', () => {
        expect(presetValues.equal({ a: 1, b: 'x' }, { b: 'x', a: 1 })).toBe(true);
    });

    it('разные значения или набор ключей', () => {
        expect(presetValues.equal({ a: 1 }, { a: 2 })).toBe(false);
        expect(presetValues.equal({ a: 1 }, { a: 1, b: 2 })).toBe(false);
        expect(presetValues.equal({ a: 1 }, { b: 1 })).toBe(false);
    });

    it('строка и число не равны', () => {
        expect(presetValues.equal({ a: 1 }, { a: '1' })).toBe(false);
    });
});
