import { describe, it, expect } from 'vitest';

import { configValues } from '@/entities/script/values/config-values';

describe('configValues.defaults', () => {
    it('без конфига - пустые значения', () => {
        expect(configValues.defaults(undefined)).toEqual({ hk: {}, val: {} });
    });

    it('берёт key и val записей', () => {
        const defaults = configValues.defaults({
            hk: { run: { key: 'F1', description: 'Run' } },
            val: {
                speed: { val: 3, description: 'Speed' },
                loud: { val: false, description: 'Loud' },
            },
        });
        expect(defaults).toEqual({ hk: { run: 'F1' }, val: { speed: 3, loud: false } });
    });

    it('конфиг без hk или val даёт пустую часть', () => {
        expect(configValues.defaults({ val: { a: { val: 'x', description: 'A' } } })).toEqual({
            hk: {},
            val: { a: 'x' },
        });
    });
});

describe('configValues.merge', () => {
    const defaults = { hk: { run: 'F1', stop: 'F2' }, val: { speed: 3, name: 'a' } };

    it('сохранённое перекрывает дефолты по ключам', () => {
        expect(configValues.merge(defaults, { hk: { run: 'F5' }, val: { speed: 7 } })).toEqual({
            hk: { run: 'F5', stop: 'F2' },
            val: { speed: 7, name: 'a' },
        });
    });

    it('пустое сохранённое возвращает дефолты', () => {
        expect(configValues.merge(defaults, {})).toEqual(defaults);
    });

    it('ключи, которых нет в дефолтах, сохраняются', () => {
        expect(configValues.merge(defaults, { val: { extra: true } }).val).toEqual({
            speed: 3,
            name: 'a',
            extra: true,
        });
    });

    it('не мутирует аргументы', () => {
        const saved = { hk: { run: 'F5' } };
        configValues.merge(defaults, saved);
        expect(defaults.hk.run).toBe('F1');
        expect(saved).toEqual({ hk: { run: 'F5' } });
    });
});
