import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { errors, logger } from '@cion-suite/core';
import { fsx } from '@app/utils/fsx';
import { paths } from '@app/utils/paths';
import { repo } from '@shared/repo';
import type { AddSourceOptions, Source, UpdateSourceOptions } from '@shared/types';

const log = logger.child('Sources');

/** Запись sources.json: Source без маски токена. */
export type SourceRecord = Omit<Source, 'tokenMask'>;

const DEFAULT_URL = 'https://github.com/Lazy-World/wf-macro';
const DEFAULT_BRANCH = 'main';

// Битый файл бросает, а не даёт []: иначе следующий add
// перезаписал бы файл и стёр все источники.
async function read(): Promise<SourceRecord[]> {
    const parsed = await fsx.json.read<unknown>(paths.sources());
    if (!Array.isArray(parsed)) return [];
    // Внешние источники прежних версий: не git - отбрасываем
    return parsed.filter((s): s is SourceRecord => typeof s === 'object' && s !== null && s.type === 'git');
}

function write(sources: SourceRecord[]): Promise<void> {
    return fsx.json.write(paths.sources(), sources);
}

function indexOf(sources: SourceRecord[], sourceId: string): number {
    const index = sources.findIndex(s => s.id === sourceId);
    if (index === -1) throw errors.fail('not_found', `Source not found: ${sourceId}`);
    return index;
}

/** sources.json: список источников без токенов. */
export const store = {
    list: read,

    async get(sourceId: string): Promise<SourceRecord> {
        const sources = await read();
        return sources[indexOf(sources, sourceId)]!;
    },

    async add(options: AddSourceOptions): Promise<SourceRecord> {
        const sources = await read();
        const source: SourceRecord = { ...options, id: randomUUID(), name: repo.name(options.url) };
        await write([...sources, source]);
        return source;
    },

    async update(sourceId: string, patch: UpdateSourceOptions): Promise<SourceRecord> {
        const sources = await read();
        const index = indexOf(sources, sourceId);
        const fields = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
        // Имя выводится из url: ручной name при смене url не живёт
        const name = patch.url === undefined ? {} : { name: repo.name(patch.url) };
        const updated: SourceRecord = { ...sources[index]!, ...fields, ...name };
        sources[index] = updated;
        await write(sources);
        return updated;
    },

    async remove(sourceId: string): Promise<void> {
        const sources = await read();
        indexOf(sources, sourceId);
        await write(sources.filter(s => s.id !== sourceId));
    },

    // Первый запуск - файла нет. Удалили источник по умолчанию -
    // там [], и seed не повторяется.
    async seed(): Promise<void> {
        try {
            await fs.access(paths.sources());
            return;
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw errors.fail('failed', 'Cannot access sources.json', { cause: e });
            }
        }
        const source: SourceRecord = {
            id: randomUUID(),
            type: 'git',
            name: repo.name(DEFAULT_URL),
            url: DEFAULT_URL,
            branch: DEFAULT_BRANCH,
            isPrivate: false,
        };
        await write([source]);
        log.info('Seeded default source', DEFAULT_URL);
    },
};
