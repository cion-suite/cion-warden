import type { Logger } from '@cion-suite/core/log';
import type {
    GithubRateLimitEntry,
    GithubRateLimitResource,
    GithubRateLimitResult,
} from '@shared/types/github.js';
import {
    GITHUB_API,
    GITHUB_USER_AGENT,
    fetchWithTimeout,
} from '../utils/github-api.js';
import { listSources } from './sources-store.js';
import type { SourceTokens } from './source-tokens.js';

interface RawRateLimit {
    resources: {
        core?: GithubRateLimitResource;
        search?: GithubRateLimitResource;
    };
}

async function fetchOne(
    sourceId: string | null,
    sourceName: string,
    token: string | null,
): Promise<GithubRateLimitEntry> {
    const headers: Record<string, string> = {
        'User-Agent': GITHUB_USER_AGENT,
        Accept: 'application/vnd.github+json',
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
        const res = await fetchWithTimeout(`${GITHUB_API}/rate_limit`, { headers });
        if (!res.ok) {
            return {
                sourceId,
                sourceName,
                ok: false,
                error: `HTTP ${res.status} ${res.statusText}`,
            };
        }
        const body = (await res.json()) as RawRateLimit;
        return {
            sourceId,
            sourceName,
            ok: true,
            core: body.resources?.core,
            search: body.resources?.search,
        };
    } catch (err) {
        return {
            sourceId,
            sourceName,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

export interface RateLimitDeps {
    tokens: SourceTokens;
    logger: Logger;
}

export async function getGithubRateLimits(deps: RateLimitDeps): Promise<GithubRateLimitResult> {
    const sources = await listSources(deps.logger);

    // /rate_limit itself does not consume quota (per GitHub docs), so probe
    // every saved token in parallel + one anonymous request.
    const probes = await Promise.all(
        sources.map(async (src) => {
            const token = await deps.tokens.getToken(src.id);
            if (!token) return null;
            return fetchOne(src.id, src.name || src.url, token);
        }),
    );
    const tokenEntries = probes.filter((e): e is GithubRateLimitEntry => e !== null);

    const anonymous = await fetchOne(null, 'anonymous', null);

    return {
        fetchedAt: Date.now(),
        entries: [...tokenEntries, anonymous],
    };
}
