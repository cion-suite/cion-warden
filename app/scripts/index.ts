import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { errors, events, logger } from '@cion-suite/core';
import { fsx } from '@app/utils/fsx';
import { paths } from '@app/utils/paths';
import type { Script, ScriptCfgFile, ScriptStatus } from '@shared/types';

const log = logger.child('Scripts');

const filePaths = new Map<string, string>();
const statuses = new Map<string, { status: ScriptStatus; errorMessage?: string }>();

function scriptId(filePath: string): string {
    return createHash('sha1').update(filePath).digest('hex').slice(0, 16);
}

// Нет каталога - пусто; прочий сбой чтения - failed
async function readDir(dir: string): Promise<Dirent[]> {
    try {
        return await fs.readdir(dir, { withFileTypes: true });
    } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (code === 'ENOENT' || code === 'ENOTDIR') return [];
        throw errors.fail('failed', `Cannot read ${path.basename(dir)}`, { cause: e });
    }
}

async function readConfig(cfgPath: string): Promise<ScriptCfgFile | undefined> {
    return fsx.json.read<ScriptCfgFile>(cfgPath).catch((e: unknown) => {
        log.warn(`Config is unreadable: ${cfgPath}`, e);
        return undefined;
    });
}

async function readScript(dir: string, file: Dirent): Promise<Script | null> {
    if (!file.isFile() || fsx.isTemp(file.name)) return null;
    const filePath = path.join(dir, file.name);
    let modifiedAt: number;
    try {
        modifiedAt = (await fs.stat(filePath)).mtimeMs;
    } catch {
        // Файл исчез между readdir и stat
        return null;
    }
    const ext = path.extname(file.name);
    const name = ext ? file.name.slice(0, -ext.length) : file.name;
    const cfgPath = path.join(dir, 'cfg', `${name}.json`);
    const config = await readConfig(cfgPath);
    const id = scriptId(filePath);
    filePaths.set(id, filePath);
    const known = statuses.get(id);
    return {
        id,
        name,
        filePath,
        configPath: config ? cfgPath : undefined,
        config,
        status: known?.status ?? 'idle',
        errorMessage: known?.errorMessage,
        modifiedAt,
    };
}

// Скрипты удалённых с диска не держим в кэшах
function prune(live: Set<string>): void {
    for (const id of filePaths.keys()) {
        if (live.has(id)) continue;
        filePaths.delete(id);
        statuses.delete(id);
    }
}

async function list(): Promise<Script[]> {
    const root = paths.vault();
    const sources = (await readDir(root)).filter(entry => entry.isDirectory());
    const perSource = await Promise.all(sources.map(async (source) => {
        const dir = paths.source(source.name).scripts;
        const found = await Promise.all((await readDir(dir)).map(file => readScript(dir, file)));
        return found.filter((script): script is Script => script !== null);
    }));
    const all = perSource.flat();
    prune(new Set(all.map(script => script.id)));
    return all;
}

/** Реестр скриптов vault: список, id -> путь, статусы. */
export const scripts = {
    list,

    /** Путь по id из последнего list; нет в кэше - not_found. */
    path(id: string): string {
        const filePath = filePaths.get(id);
        if (filePath === undefined) throw errors.fail('not_found', `Script not found: ${id}`);
        return filePath;
    },

    /** Известные id с путями: сверка с процессами ОС. */
    known: (): ReadonlyMap<string, string> => filePaths,

    status: {
        get: (id: string): ScriptStatus | undefined => statuses.get(id)?.status,

        /** Запоминает статус и сообщает renderer. */
        set(id: string, status: ScriptStatus, errorMessage?: string): void {
            statuses.set(id, { status, errorMessage });
            events.emit('script:status:changed', { id, status, errorMessage });
        },
    },

    /** Все id со статусом running. */
    running: (): string[] => [...statuses].filter(([, s]) => s.status === 'running').map(([id]) => id),
};
