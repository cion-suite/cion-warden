import { describe, it, expect } from 'vitest';

import { settingsSchema } from '@shared/settings';
import { DEFAULT_LOCALE, resources, SUPPORTED_LOCALES } from '@/lib/i18n/resources';

type Tree = { readonly [key: string]: string | Tree };

const leaves = (tree: Tree, prefix = ''): Record<string, string> =>
    Object.entries(tree).reduce<Record<string, string>>((acc, [key, value]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        return typeof value === 'string' ? { ...acc, [path]: value } : { ...acc, ...leaves(value, path) };
    }, {});

const placeholders = (text: string) => (text.match(/{{\s*\w+\s*}}/g) ?? []).sort();

const en = leaves(resources.en.common);
const ru = leaves(resources.ru.common);

describe('i18n resources: паритет en / ru', () => {
    it('набор ключей совпадает', () => {
        expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
    });

    it('плейсхолдеры интерполяции совпадают', () => {
        for (const key of Object.keys(en)) {
            expect(placeholders(ru[key] ?? ''), key).toEqual(placeholders(en[key]));
        }
    });

    it('пустых переводов нет', () => {
        expect(Object.entries({ ...en, ...ru }).filter(([, text]) => text.trim() === '')).toEqual([]);
    });
});

describe('i18n resources: локали', () => {
    it('SUPPORTED_LOCALES == enum settings.locale', () => {
        expect([...SUPPORTED_LOCALES].sort()).toEqual([...settingsSchema.shape.locale.unwrap().options].sort());
    });

    it('DEFAULT_LOCALE поддерживается и совпадает с дефолтом settings', () => {
        expect(SUPPORTED_LOCALES).toContain(DEFAULT_LOCALE);
        expect(settingsSchema.shape.locale.parse(undefined)).toBe(DEFAULT_LOCALE);
    });
});
