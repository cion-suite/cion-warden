import { logger } from '@cion-suite/core';
import { fsx } from '@app/utils/fsx';
import { paths } from '@app/utils/paths';
import type { Font } from '@shared/types';

const log = logger.child('Fonts');

/** installed-fonts.json: id шрифта -> установленная запись. */
type FontIndex = Record<string, Font>;

// Индекс читают и пишут по одному: параллельные установки
// теряют записи, и значения HKCU остаются без хозяина
let mutex: Promise<unknown> = Promise.resolve();

function lock<T>(job: () => Promise<T>): Promise<T> {
    const next = mutex.then(job, job);
    mutex = next.catch(() => undefined);
    return next;
}

// Битый индекс - пустой: следующая запись его пересоздаст
async function read(): Promise<FontIndex> {
    const index = await fsx.json.read<FontIndex>(paths.fonts.index()).catch((e: unknown) => {
        log.warn('Font index unreadable', e);
        return undefined;
    });
    return index ?? {};
}

export const ledger = {
    lock,
    read,
    write: (index: FontIndex): Promise<void> => fsx.json.write(paths.fonts.index(), index),
};
