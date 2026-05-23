import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { app } from 'electron';
import type { Logger } from '@cion-suite/core/log';
import type { GitVaultSource, VaultSource } from '@shared/types/vault.js';
import { deriveGitName } from '../utils/github-url.js';
import { atomicWriteFile } from '../utils/json-file.js';

function getPath(): string {
    return path.join(app.getPath('userData'), 'sources.json');
}

// On parse failure we throw rather than return [] — a truthy-but-empty read
// would let the next addSource() overwrite a still-existing (just corrupted
// or briefly unreadable) file, permanently destroying every source.
async function read(logger?: Logger): Promise<VaultSource[]> {
    let raw: string;
    try {
        raw = await fs.readFile(getPath(), 'utf-8');
    } catch (err) {
        const code = (err as NodeJS.ErrnoException)?.code;
        if (code === 'ENOENT') return [];
        logger?.error('sources-store.read', err);
        throw err;
    }
    try {
        return JSON.parse(raw) as VaultSource[];
    } catch (err) {
        logger?.error('sources-store.parse', err);
        throw new Error('sources.json is corrupted');
    }
}

async function write(sources: VaultSource[]): Promise<void> {
    await atomicWriteFile(getPath(), JSON.stringify(sources, null, 2));
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

// Strict field allowlist per source type — prevents an incoming patch from
// flipping `type` (git→external) or injecting foreign fields that would
// corrupt the discriminated union at consumer sites.
const GIT_PATCH_FIELDS = new Set(['name', 'url', 'branch', 'isPrivate']);
const EXTERNAL_PATCH_FIELDS = new Set(['name', 'scriptsUrl', 'libsUrl', 'cfgUrl']);

function sanitizePatch(type: VaultSource['type'], patch: Record<string, unknown>): Record<string, unknown> {
    const allowed = type === 'git' ? GIT_PATCH_FIELDS : EXTERNAL_PATCH_FIELDS;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
        if (allowed.has(k)) out[k] = v;
    }
    return out;
}

export async function updateSource(id: string, patch: Record<string, unknown>, logger?: Logger): Promise<VaultSource> {
    const sources = await read(logger);
    const idx = sources.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error(`Source not found: ${id}`);
    const current = sources[idx]!;
    const safe = sanitizePatch(current.type, patch);
    // Re-derive name when a git source URL changes
    const finalPatch =
        current.type === 'git' && typeof safe.url === 'string'
            ? { ...safe, name: deriveGitName(safe.url) }
            : safe;
    const updated = { ...current, ...finalPatch } as VaultSource;
    sources[idx] = updated;
    await write(sources);
    return updated;
}
