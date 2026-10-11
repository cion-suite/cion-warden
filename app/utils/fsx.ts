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

/** Временный файл записи: не данные. */
function isTemp(name: string): boolean {
    return name.endsWith('.tmp');
}

async function read<T>(file: string): Promise<T | undefined> {
    let raw: string;
    try {
        raw = await fs.readFile(file, 'utf-8');
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw errors.fail('failed', `Cannot read ${path.basename(file)}`, { cause: e });
    }
    try {
        return JSON.parse(raw) as T;
    } catch (e) {
        throw errors.fail('validation', `${path.basename(file)} is corrupted`, { cause: e });
    }
}

/** Пути, атомарная запись JSON и хеш blob как у git. */
export const fsx = {
    confine,
    write,
    exists: (file: string): Promise<boolean> => fs.access(file).then(() => true, () => false),
    isTemp,
    /** Совпадает с sha из GitHub tree. */
    sha(content: Uint8Array): string {
        return createHash('sha1')
            .update(`blob ${content.length}\0`)
            .update(content)
            .digest('hex');
    },
    json: {
        /** undefined - нет файла; битый JSON - validation. */
        read,
        write: (file: string, data: unknown): Promise<void> => write(file, JSON.stringify(data, null, 2)),
    },
};
