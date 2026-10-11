import { describe, expect, it } from 'vitest';
import type { PresetSchema } from '@shared/types';

import { presetValues } from '@/entities/bind/form/preset-values';

const schema: PresetSchema = {
    title: 'P',
    sections: [
        {
            name: 'keys',
            title: 'Keys',
            fields: [
                { key: 'keys.jump', label: 'Jump', type: 'hotkey', default: 'Space' },
                { key: 'keys.fast', label: 'Fast', type: 'boolean', default: false },
            ],
        },
        { name: 'empty', title: 'Empty', fields: [] },
        { name: 'tune', title: 'Tune', fields: [{ key: 'tune.speed', label: 'Speed', type: 'number', default: 5 }] },
    ],
};

describe('presetValues.fields / defaults', () => {
    it('собирает поля всех секций', () => {
        expect(presetValues.fields(schema).map((f) => f.key)).toEqual(['keys.jump', 'keys.fast', 'tune.speed']);
    });

    it('без схемы - пусто', () => {
        expect(presetValues.fields(null)).toEqual([]);
        expect(presetValues.defaults(null)).toEqual({});
    });

    it('defaults по ключам полей', () => {
        expect(presetValues.defaults(schema)).toEqual({ 'keys.jump': 'Space', 'keys.fast': false, 'tune.speed': 5 });
    });
});

describe('presetValues.strip', () => {
    it('оставляет только отличия от defaults', () => {
        const values = { 'keys.jump': 'F1', 'keys.fast': false, 'tune.speed': 5 };
        expect(presetValues.strip(values, schema)).toEqual({ 'keys.jump': 'F1' });
    });

    it('отбрасывает ключи вне схемы', () => {
        expect(presetValues.strip({ 'x.y': 1, 'tune.speed': 7 }, schema)).toEqual({ 'tune.speed': 7 });
    });

    it('без полей схемы возвращает копию', () => {
        const values = { 'a.b': 1 };
        const out = presetValues.strip(values, null);
        expect(out).toEqual(values);
        expect(out).not.toBe(values);
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
});
