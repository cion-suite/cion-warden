import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { app } from 'electron';
import type { GitVaultSource, VaultSource } from '@shared/types/vault.js';

function getPath(): string {
    return path.join(app.getPath('userData'), 'sources.json');
}

async function read(): Promise<VaultSource[]> {
    try {
        return JSON.parse(await fs.readFile(getPath(), 'utf-8')) as VaultSource[];
    } catch {
        return [];
    }
}

async function write(sources: VaultSource[]): Promise<void> {
    await fs.writeFile(getPath(), JSON.stringify(sources, null, 2), 'utf-8');
}

export function deriveGitName(url: string): string {
    const m = url.match(/github\.com\/([^/]+)\/([^/.\s]+)/);
    if (m?.[1] && m[2]) return `${m[1]}/${m[2].replace(/\.git$/, '')}`;
    try {
        const u = new URL(url);
        const parts = u.pathname.replace(/\.git$/, '').split('/').filter(Boolean);
        if (parts.length >= 2) return parts.slice(-2).join('/');
        if (parts.length === 1) return parts[0]!;
    } catch {
        // ignore malformed URLs
    }
    return url;
}

export async function listSources(): Promise<VaultSource[]> {
    return read();
}

export async function addSource(data: Omit<VaultSource, 'id'>): Promise<VaultSource> {
    const sources = await read();
    const withName =
        data.type === 'git'
            ? { ...(data as Omit<GitVaultSource, 'id'>), name: deriveGitName((data as Omit<GitVaultSource, 'id'>).url) }
            : data;
    const source = { ...withName, id: crypto.randomUUID() } as VaultSource;
    sources.push(source);
    await write(sources);
    return source;
}

export async function removeSource(id: string): Promise<void> {
    const sources = await read();
    await write(sources.filter((s) => s.id !== id));
}

export async function updateSource(id: string, patch: Record<string, unknown>): Promise<VaultSource> {
    const sources = await read();
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
