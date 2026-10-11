import path from 'node:path';
import { errors } from '@cion-suite/core';
import type { ConfigRef } from '@app/catalog/types';
import { fsx } from '@app/utils/fsx';
import { paths } from '@app/utils/paths';
import { ahk } from '@app/utils/ahk';
import type { ConfigSchema, ConfigValues } from '@shared/types';

function resolve(ref: ConfigRef): string {
    const root = paths.source(ref.sourceId).base;
    return fsx.confine(root, path.join(root, ref.path));
}

/** Значения в скачанных .ahk: чтение, правка, перенос. */
export const config = {
    path: resolve,

    /** Схема файла со значениями; нет файла - null. */
    async read(ref: ConfigRef): Promise<ConfigSchema | null> {
        const text = await fsx.text.read(resolve(ref));
        return text === undefined ? null : ahk.parse(text);
    },

    /** Значения в присваивания; незнакомые ключи игнорируются. */
    async save(ref: ConfigRef, values: ConfigValues): Promise<void> {
        const file = resolve(ref);
        await fsx.queue(file, async () => {
            const text = await fsx.text.read(file);
            if (text === undefined) throw errors.fail('not_found', `Config is not downloaded: ${ref.path}`);
            const next = ahk.patch(text, values);
            if (next !== text) await fsx.write(file, next);
        });
    },

    /** Новый файл; значения рабочего переносятся в него. */
    async install(ref: ConfigRef, content: Uint8Array): Promise<void> {
        const file = resolve(ref);
        await fsx.queue(file, async () => {
            const previous = await fsx.text.read(file);
            const text = Buffer.from(content).toString('utf-8');
            await fsx.write(file, previous === undefined ? content : ahk.merge(text, previous));
        });
    },
};
