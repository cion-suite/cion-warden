import { registerHandlers } from '@cion-suite/core/ipc';
import type { VaultSource } from '@shared/types/vault.js';
import type { AppServices } from '../types/services.js';
import { listSources, addSource, removeSource, updateSource } from '../services/sources-store.js';
import { requireString } from '../utils/ipc-args.js';
import { parseGithubUrl } from '../utils/github-url.js';

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
    const res = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'cion-warden/1.0',
        },
    });
    if (res.ok) return { ok: true };
    return { ok: false, status: res.status, message: res.statusText };
}

export function registerSourceHandlers(services: AppServices): void {
    const { logger, sourceTokens } = services;

    registerHandlers({
        'sources:list': async () => enrichWithToken(await listSources(logger), services),

        'sources:add': (_event, rawData: unknown) =>
            addSource(rawData as Omit<VaultSource, 'id'>, logger),

        'sources:remove': async (_event, rawId: unknown) => {
            const id = requireString(rawId, 'id');
            await removeSource(id, logger);
            await sourceTokens.removeToken(id);
        },

        'sources:update': async (_event, rawId: unknown, rawPatch: unknown) => {
            const id = requireString(rawId, 'id');
            const patch = (rawPatch ?? {}) as Record<string, unknown>;
            const updated = await updateSource(id, patch, logger);
            if (patch.isPrivate === false) await sourceTokens.removeToken(id);
            return updated;
        },

        'sources:set-token': async (_event, rawId: unknown, rawToken: unknown) => {
            const id = requireString(rawId, 'id');
            const token = requireString(rawToken, 'token');
            await sourceTokens.setToken(id, token);
        },

        'sources:remove-token': async (_event, rawId: unknown) => {
            const id = requireString(rawId, 'id');
            await sourceTokens.removeToken(id);
        },

        'sources:test-token': async (_event, rawId: unknown) =>
            testToken(services, requireString(rawId, 'id')),

        'sources:get-token-mask': async (_event, rawId: unknown) => {
            const id = requireString(rawId, 'id');
            return sourceTokens.getTokenMask(id);
        },
    });
}
