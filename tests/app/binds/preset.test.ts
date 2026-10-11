import { describe, expect, it } from 'vitest';
import { preset } from '@app/binds/preset';

describe('preset.schema', () => {
    it('секции, поля и типы по значениям', () => {
        const raw = { $version: 1, misc: { fps: 144, on: true, shoot: 'F9', bad: null }, empty: { x: [] }, note: 'text' };

        expect(preset.schema(raw, 'game.json')).toEqual({
            title: 'game',
            sections: [{
                name: 'misc',
                title: 'misc',
                fields: [
                    { key: 'misc.fps', label: 'fps', type: 'number', default: 144 },
                    { key: 'misc.on', label: 'on', type: 'boolean', default: true },
                    { key: 'misc.shoot', label: 'shoot', type: 'hotkey', default: 'F9' },
                ],
            }],
        });
    });

    it('не объект - null; конечное число обязательно', () => {
        expect(preset.schema([], 'a.json')).toBeNull();
        expect(preset.schema('x', 'a.json')).toBeNull();
        expect(preset.schema({ s: { n: Number.POSITIVE_INFINITY } }, 'a.json')).toEqual({ title: 'a', sections: [] });
    });
});

describe('preset.flatten', () => {
    it('вложенный -> плоский, примитивы, без $ и не-объектов', () => {
        const raw = { $version: 1, a: { x: 1, y: 's', z: false, o: {} }, b: 5 };

        expect(preset.flatten(raw)).toEqual({ 'a.x': 1, 'a.y': 's', 'a.z': false });
        expect(preset.flatten(null)).toEqual({});
    });
});

describe('preset.nest', () => {
    it('плоский -> вложенный по первой точке', () => {
        const out = preset.nest({ 'a.x': 1, 'a.b.c': 's', 'b.y': true });

        expect(JSON.parse(JSON.stringify(out))).toEqual({ a: { x: 1, 'b.c': 's' }, b: { y: true } });
    });

    it('ключи без секции или поля отбрасываются', () => {
        expect(JSON.parse(JSON.stringify(preset.nest({ x: 1, '.y': 2, 'z.': 3 })))).toEqual({});
    });

    it('__proto__ не загрязняет Object.prototype', () => {
        const out = preset.nest(JSON.parse('{"__proto__.polluted":"yes","__proto__.__proto__":"x"}') as Record<string, string>);

        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
        expect(Object.getPrototypeOf(out)).toBeNull();
        expect(Object.keys(out)).toEqual(['__proto__']);
    });
});
