import { registerHandlers } from '@cion-suite/core/ipc';
import type { VaultSource } from '@shared/types/vault.js';
import type { NewSource } from '../types/sources.js';
import type { AppServices } from '../types/services.js';
import { listSources, addSource, removeSource, updateSource } from '../services/sources-store.js';
import { requireString } from '../utils/ipc-args.js';
import { parseGithubUrl } from '../utils/github-url.js';
import { probeRepo } from '../utils/github-api.js';

// IPC is a trust boundary. The renderer is allowed to send any JSON; we must
// reject malformed source shapes here so sources.json never holds garbage.
function validateNewSource(raw: unknown): NewSource {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid source payload');
    const r = raw as Record<string, unknown>;
    if (r.type === 'git') {
        if (typeof r.url !== 'string' || r.url.length === 0) throw new Error('Invalid git url');
        if (typeof r.branch !== 'string') throw new Error('Invalid branch');
        return {
            type: 'git',
            name: typeof r.name === 'string' ? r.name : '',
            url: r.url,
            branch: r.branch,
            isPrivate: r.isPrivate === true,
        };
    }
    if (r.type === 'external') {
        if (typeof r.name !== 'string') throw new Error('Invalid name');
        if (typeof r.scriptsUrl !== 'string') throw new Error('Invalid scriptsUrl');
        if (typeof r.libsUrl !== 'string') throw new Error('Invalid libsUrl');
        if (typeof r.cfgUrl !== 'string') throw new Error('Invalid cfgUrl');
        return {
            type: 'external',
            name: r.name,
            scriptsUrl: r.scriptsUrl,
            libsUrl: r.libsUrl,
            cfgUrl: r.cfgUrl,
        };
    }
    throw new Error('Unknown source type');
}

async function enrichWithToken(
    sources: VaultSource[],
    services: AppServices,
): Promise<VaultSource[]> {
    return Promise.all(
        sources.map(async (s) =>
            s.type === 'git'
                ? { ...s, hasToken: await services.sourceTokens.hasToken(s.id) }
                : s,
        ),
    );
}

async function testToken(
    services: AppServices,
    id: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
    const sources = await listSources(services.logger);
    const source = sources.find((s) => s.id === id);
    if (!source) return { ok: false, status: 0, message: 'Source not found' };
    if (source.type !== 'git') return { ok: false, status: 0, message: 'Not a git source' };
    const token = await services.sourceTokens.getToken(id);
    if (!token) return { ok: false, status: 0, message: 'No token' };
    const parsed = parseGithubUrl(source.url);
    if (!parsed) return { ok: false, status: 0, message: 'Invalid GitHub URL' };
    const res = await probeRepo(parsed.owner, parsed.repo, token);
    if (res.ok) return { ok: true };
    return { ok: false, status: res.status, message: res.statusText };
}

export function registerSourceHandlers(services: AppServices): void {
    const { logger, sourceTokens } = services;

    registerHandlers({
        'sources:list': async () => enrichWithToken(await listSources(logger), services),

        'sources:add': (_event, rawData: unknown) =>
            addSource(validateNewSource(rawData), logger),

        'sources:remove': async (_event, rawId: unknown) => {
            const id = requireString(rawId, 'id');
            // Token before source — reverse order would orphan the credential
            // in the keychain if removeSource succeeded and removeToken threw.
            if (await sourceTokens.hasToken(id)) {
                await sourceTokens.removeToken(id);
            }
            await removeSource(id, logger);
        },

        'sources:update': async (_event, rawId: unknown, rawPatch: unknown) => {
            const id = requireString(rawId, 'id');
            const patch = (rawPatch ?? {}) as Record<string, unknown>;
            const updated = await updateSource(id, patch, logger);
            if (patch.isPrivate === false && (await sourceTokens.hasToken(id))) {
                await sourceTokens.removeToken(id);
            }
            return updated;
        },

        'sources:remove-token': async (_event, rawId: unknown) => {
            const id = requireString(rawId, 'id');
            if (await sourceTokens.hasToken(id)) {
                await sourceTokens.removeToken(id);
            }
        },

        'sources:set-token': async (_event, rawId: unknown, rawToken: unknown) => {
            const id = requireString(rawId, 'id');
            const token = requireString(rawToken, 'token');
            await sourceTokens.setToken(id, token);
        },

        'sources:test-token': async (_event, rawId: unknown) =>
            testToken(services, requireString(rawId, 'id')),

        'sources:get-token-mask': async (_event, rawId: unknown) => {
            const id = requireString(rawId, 'id');
            return sourceTokens.getTokenMask(id);
        },
    });
}
