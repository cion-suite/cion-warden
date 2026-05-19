import fs from 'node:fs/promises';
import path from 'node:path';

export async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
    try {
        return JSON.parse(await fs.readFile(filePath, 'utf-8')) as T;
    } catch {
        return undefined;
    }
}

export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}
