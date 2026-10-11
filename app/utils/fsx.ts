import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { errors } from '@cion-suite/core';

/** child строго внутри root: сам root и `..` - validation. */
function confine(root: string, child: string): string {
    const rel = path.relative(path.resolve(root), path.resolve(child));
    const inside = rel !== '' && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
    errors.assert(inside, `Path escapes ${path.basename(root)}: ${child}`);
    return child;
}

// Обрыв записи не оставит усечённый файл: читатель
// иначе принял бы данные за потерянные.
async function write(file: string, content: string | Uint8Array): Promise<void> {
    const tmp = `${file}.${randomUUID()}.tmp`;
    try {
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(tmp, content);
        await fs.rename(tmp, file);
    } catch (e) {
        await fs.rm(tmp, { force: true });
        throw errors.fail('failed', `Cannot write ${path.basename(file)}`, { cause: e });
    }
}

// Ждёт предыдущую задачу ключа; её сбой не блокирует
const tails = new Map<string, Promise<void>>();

function queue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const run = (tails.get(key) ?? Promise.resolve()).then(() => task());
    const tail = run.then(() => undefined, () => undefined);
    tails.set(key, tail);
    void tail.then(() => {
        if (tails.get(key) === tail) tails.delete(key);
    });
    return run;
}

/** Временный файл записи: не данные. */
function isTemp(name: string): boolean {
    return name.endsWith('.tmp');
}

async function readText(file: string): Promise<string | undefined> {
    try {
        return await fs.readFile(file, 'utf-8');
    } catch (e) {
        if (isMissing(e)) return undefined;
        throw errors.fail('failed', `Cannot read ${path.basename(file)}`, { cause: e });
    }
}

async function read<T>(file: string): Promise<T | undefined> {
    const raw = await readText(file);
    if (raw === undefined) return undefined;
    try {
        return JSON.parse(raw) as T;
    } catch (e) {
        throw errors.fail('validation', `${path.basename(file)} is corrupted`, { cause: e });
    }
}

/** Файла нет: ENOENT, остальные сбои чтения не прячем. */
function isMissing(e: unknown): boolean {
    return (e as NodeJS.ErrnoException).code === 'ENOENT';
}

/** Пути, атомарная запись JSON и хеш blob как у git. */
export const fsx = {
    confine,
    write,
    exists: (file: string): Promise<boolean> => fs.access(file).then(() => true, () => false),
    isTemp,
    isMissing,
    /** Задачи с одним ключом идут по очереди. */
    queue,
    /** Совпадает с sha из GitHub tree. */
    sha(content: Uint8Array): string {
        return createHash('sha1')
            .update(`blob ${content.length}\0`)
            .update(content)
            .digest('hex');
    },
    text: {
        /** undefined - нет файла; прочие сбои - failed. */
        read: readText,
    },
    json: {
        /** undefined - нет файла; битый JSON - validation. */
        read,
        write: (file: string, data: unknown): Promise<void> => write(file, JSON.stringify(data, null, 2)),
    },
};
