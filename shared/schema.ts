// Граница IPC: общие схемы аргументов каналов.

import { z } from 'zod';
import { cmd } from './cmd';

const primitive = z.union([z.string(), z.number(), z.boolean()]);

// Ключ пресета: section.field, без имён прототипа
const PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isPresetKey(key: string): boolean {
    const parts = key.split('.');
    return parts.length >= 2 && parts.every(part => part !== '' && !PROTO_KEYS.has(part));
}

/** Схемы аргументов каналов; пустая строка - отказ. */
export const schema = {
    nonEmpty: z.string().min(1),
    token: z.string().trim().min(1),
    addSource: z.strictObject({
        type: z.literal('git'),
        url: z.string().min(1),
        branch: z.string(),
        isPrivate: z.boolean(),
    }),
    updateSource: z.strictObject({
        name: z.string(),
        url: z.string().min(1),
        branch: z.string(),
        isPrivate: z.boolean(),
    }).partial(),
    source: {
        // id - сегмент пути в global_vault
        id: z.string().regex(/^[\w-]+$/),
    },
    script: {
        id: z.string().regex(/^[0-9a-f]{16}$/),
        values: z.strictObject({
            hk: z.record(z.string(), z.string()),
            val: z.record(z.string(), primitive),
        }),
    },
    preset: {
        values: z.record(z.string().refine(isPresetKey), primitive),
    },
    file: {
        // Один сегмент пути из manifest, без метасимволов
        name: z.string().min(1).refine(name => name !== '.' && name !== '..' && !/[\\/]/.test(name) && cmd.allows(name)),
    },
    config: {
        // Без .json values.json совпал бы с cfg и затёр его
        path: z.string().min(1).endsWith('.json'),
    },
};
