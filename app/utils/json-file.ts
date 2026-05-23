import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
    try {
        return JSON.parse(await fs.readFile(filePath, 'utf-8')) as T;
    } catch {
        return undefined;
    }
}

// Prevents truncated JSON on power loss or app kill mid-write — a naive
// writeFile would leave the file empty long enough for the next reader to
// treat the data as gone and overwrite it.
export async function atomicWriteFile(filePath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(tmp, content, 'utf-8');
    await fs.rename(tmp, filePath);
}

export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
    await atomicWriteFile(filePath, JSON.stringify(data, null, 2));
}
