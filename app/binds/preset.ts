import { catalog } from '@app/catalog';
import type { PresetField, PresetSchema, PresetSection, PresetValues } from '@shared/types';

type Primitive = string | number | boolean;
type Nested = Record<string, Record<string, Primitive>>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isPrimitive = (value: unknown): value is Primitive =>
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

function fieldType(value: unknown): PresetField['type'] | null {
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number' && Number.isFinite(value)) return 'number';
    // В пресетах привязок строка - клавиша
    if (typeof value === 'string') return 'hotkey';
    return null;
}

/** Файл пресета и файл значений: разбор и склейка. */
export const preset = {
    /**
     * Схема из json пресета: секции верхнего уровня, в них поля.
     * Ключи с `$` и не-объекты пропускаются.
     */
    schema(raw: unknown, fileName: string): PresetSchema | null {
        if (!isRecord(raw)) return null;
        const sections: PresetSection[] = [];
        for (const [name, body] of Object.entries(raw)) {
            if (name.startsWith('$') || !isRecord(body)) continue;
            const fields: PresetField[] = [];
            for (const [label, value] of Object.entries(body)) {
                const type = fieldType(value);
                if (type) fields.push({ key: `${name}.${label}`, label, type, default: value as Primitive });
            }
            if (fields.length > 0) sections.push({ name, title: name, fields });
        }
        return { title: catalog.stem(fileName), sections };
    },

    /** Вложенный файл значений -> плоское `<section>.<field>`. */
    flatten(raw: unknown): PresetValues {
        const out: PresetValues = {};
        if (!isRecord(raw)) return out;
        for (const [section, body] of Object.entries(raw)) {
            if (section.startsWith('$') || !isRecord(body)) continue;
            for (const [field, value] of Object.entries(body)) {
                if (isPrimitive(value)) out[`${section}.${field}`] = value;
            }
        }
        return out;
    },

    /** Плоские значения -> вложенные для файла. */
    nest(flat: PresetValues): Nested {
        // Без прототипа: `__proto__` не дойдёт до Object.prototype
        const out: Nested = Object.create(null) as Nested;
        for (const [key, value] of Object.entries(flat)) {
            const dot = key.indexOf('.');
            if (dot <= 0 || dot === key.length - 1) continue;
            const section = key.slice(0, dot);
            out[section] ??= Object.create(null) as Record<string, Primitive>;
            out[section][key.slice(dot + 1)] = value;
        }
        return out;
    },
};
