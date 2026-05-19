import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { app } from 'electron';
import type { Logger } from '@cion-suite/core/log';
import type { GitVaultSource, VaultSource } from '@shared/types/vault.js';
import { deriveGitName } from '../utils/github-url.js';

function getPath(): string {
    return path.join(app.getPath('userData'), 'sources.json');
}

async function read(logger?: Logger): Promise<VaultSource[]> {
    try {
        return JSON.parse(await fs.readFile(getPath(), 'utf-8')) as VaultSource[];
    } catch (err) {
        const code = (err as NodeJS.ErrnoException)?.code;
        if (code === 'ENOENT') return [];
        logger?.error('sources-store.read', err);
        return [];
    }
}

async function write(sources: VaultSource[]): Promise<void> {
    await fs.writeFile(getPath(), JSON.stringify(sources, null, 2), 'utf-8');
}

export async function listSources(logger?: Logger): Promise<VaultSource[]> {
    return read(logger);
}

export async function addSource(data: Omit<VaultSource, 'id'>, logger?: Logger): Promise<VaultSource> {
    const sources = await read(logger);
    const withName =
        data.type === 'git'
            ? { ...(data as Omit<GitVaultSource, 'id'>), name: deriveGitName((data as Omit<GitVaultSource, 'id'>).url) }
            : data;
    const source = { ...withName, id: crypto.randomUUID() } as VaultSource;
    sources.push(source);
    await write(sources);
    return source;
}

export async function removeSource(id: string, logger?: Logger): Promise<void> {
    const sources = await read(logger);
    await write(sources.filter((s) => s.id !== id));
}

export async function updateSource(id: string, patch: Record<string, unknown>, logger?: Logger): Promise<VaultSource> {
    const sources = await read(logger);
    const idx = sources.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error(`Source not found: ${id}`);
    const current = sources[idx]!;
    // Re-derive name when a git source URL changes
    const finalPatch =
        current.type === 'git' && typeof patch.url === 'string'
            ? { ...patch, name: deriveGitName(patch.url) }
            : patch;
    const updated = { ...current, ...finalPatch } as VaultSource;
    sources[idx] = updated;
    await write(sources);
    return updated;
}
