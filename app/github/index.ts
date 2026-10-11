import { errors, events, http, type AppError, type HttpClientOptions, type HttpReply } from '@cion-suite/core';
import type { GithubTree, GithubTreeReply } from '@app/github/types';
import { store, type SourceRecord } from '@app/sources/store';
import { tokens } from '@app/sources/tokens';
import { repo } from '@shared/repo';
import type { GithubLimit, GithubLimitEntry, GithubLimitResource, GithubRepo, GithubRepoRef } from '@shared/types';

const REQUEST_TIMEOUT_MS = 20_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const EXISTS_TTL_MS = 60_000;

// Ретраев нет, 301 у переименованных репозиториев - follow.
// no-store: raw держит кеш 5 минут, а tree шлёт свой etag.
const base: HttpClientOptions = {
    timeout: REQUEST_TIMEOUT_MS,
    retryDelays: [],
    redirect: 'follow',
    cache: 'no-store',
};
const userAgent = { 'user-agent': 'cion-warden/1.0' };
const api = http.create({
    ...base,
    baseURL: 'https://api.github.com',
    headers: { ...userAgent, accept: 'application/vnd.github+json' },
});
const raw = http.create({ ...base, baseURL: 'https://raw.githubusercontent.com', headers: userAgent });
// Страницы github.com не входят в лимит API
const web = http.create({ ...base, baseURL: 'https://github.com', headers: { ...userAgent, accept: 'application/json' } });

type Failed = Extract<HttpReply<unknown>, { ok: false }>;
type Headers = Record<string, string>;

const existence = new Map<string, { exists: boolean; at: number }>();

const bearer = (token: string | null): Headers => (token === null ? {} : { authorization: `Bearer ${token}` });

function encode(path: string): string {
    return path.split('/').map(encodeURIComponent).join('/');
}

function parse(source: SourceRecord): GithubRepoRef {
    const ref = repo.parse(source.url);
    errors.assert(ref, 'Only GitHub repositories are supported');
    return ref;
}

const slug = (ref: GithubRepoRef): string => `${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`;

// Лимит исчерпан: GitHub отвечает им 403 с remaining 0
function exhausted(status: number, headers: Headers): boolean {
    const remaining = headers['x-ratelimit-remaining'];
    return status === 403
        && remaining !== undefined
        && Number(remaining) <= 0
        && headers['x-ratelimit-reset'] !== undefined;
}

function error(status: number, isPrivate: boolean, headers: Headers = {}): AppError {
    if (exhausted(status, headers)) {
        const at = new Date(Number(headers['x-ratelimit-reset']) * 1000).toLocaleTimeString();
        return errors.fail('rate_limited', `GitHub rate limit exceeded. Resets at ${at}`, { status });
    }
    if (status === 401 || status === 403) return errors.fail('unauthorized', 'GitHub token is invalid', { status });
    if (status === 404 && isPrivate) {
        return errors.fail('forbidden', 'Token has no access to the repository', { status });
    }
    if (status === 404) return errors.fail('not_found', 'Repository not found', { status });
    return errors.fail('failed', `GitHub API error: ${status}`, { status });
}

// Нет ответа (сеть, дедлайн) - код транспорта, иначе статус
function failure(reply: Failed, isPrivate: boolean): AppError {
    if (reply.status !== undefined) return error(reply.status, isPrivate, reply.headers);
    const { code, message } = reply.error;
    return errors.fail(code === 'unknown' ? 'failed' : code, message);
}

function announce(headers: Headers): void {
    const remaining = headers['x-ratelimit-remaining'];
    const reset = headers['x-ratelimit-reset'];
    if (remaining === undefined || reset === undefined) return;
    events.emit('github:limit:changed', { remaining: Number(remaining), reset: Number(reset) });
}

// Репозитория нет - только 404, прочие сбои про него молчат
async function exists(ref: GithubRepoRef): Promise<boolean> {
    const key = `${ref.owner}/${ref.repo}`;
    const cached = existence.get(key);
    if (cached && Date.now() - cached.at < EXISTS_TTL_MS) return cached.exists;
    const reply = await api.send(`/repos/${slug(ref)}`);
    const found = reply.status !== 404;
    existence.set(key, { exists: found, at: Date.now() });
    return found;
}

async function missing(source: SourceRecord, ref: GithubRepoRef, repoPath: string): Promise<AppError> {
    if (source.isPrivate) return error(404, true);
    if (!(await exists(ref))) return error(404, false);
    return errors.fail('not_found', `File not found: ${repoPath}`);
}

async function quota(sourceId: string | null, sourceName: string, token: string | null): Promise<GithubLimitEntry> {
    const reply = await api.send<{ resources?: { core?: GithubLimitResource; search?: GithubLimitResource } }>(
        '/rate_limit',
        { headers: bearer(token) },
    );
    if (!reply.ok) return { sourceId, sourceName, ok: false, error: reply.error.message };
    return { sourceId, sourceName, ok: true, core: reply.body.resources?.core, search: reply.body.resources?.search };
}

async function file(source: SourceRecord, repoPath: string): Promise<Buffer>;
async function file(source: SourceRecord, repoPath: string, options: { fallback: null }): Promise<Buffer | null>;
async function file(source: SourceRecord, repoPath: string, options?: { fallback: null }): Promise<Buffer | null> {
    const ref = parse(source);
    const branch = source.branch || 'main';
    const reply = source.isPrivate
        ? await api.send<Uint8Array>(`/repos/${slug(ref)}/contents/${encode(repoPath)}`, {
            query: { ref: branch },
            headers: { accept: 'application/vnd.github.raw', ...bearer(await tokens.get(source.id)) },
            responseType: 'bytes',
            timeout: DOWNLOAD_TIMEOUT_MS,
        })
        : await raw.send<Uint8Array>(`/${slug(ref)}/${encode(branch)}/${encode(repoPath)}`, {
            responseType: 'bytes',
            timeout: DOWNLOAD_TIMEOUT_MS,
        });
    if (reply.ok) return Buffer.from(reply.body);
    if (reply.status === 404) {
        if (options) return null;
        throw await missing(source, ref, repoPath);
    }
    throw failure(reply, source.isPrivate);
}

/** GitHub: дерево, файлы, пробы и лимит. */
export const github = {
    /** Путь для URL: сегменты кодируются, `/` остаётся. */
    encode,

    /** Ошибка по HTTP-статусу ответа GitHub. */
    error,

    /** null - 304: дерево не менялось. Лимит уходит событием. */
    async tree(source: SourceRecord, etag?: string | null): Promise<GithubTreeReply | null> {
        const ref = parse(source);
        const token = source.isPrivate ? await tokens.get(source.id) : null;
        const reply = await api.send<GithubTree>(
            `/repos/${slug(ref)}/git/trees/${encode(source.branch || 'main')}`,
            {
                query: { recursive: 1 },
                headers: { ...bearer(token), ...(etag ? { 'if-none-match': etag } : {}) },
                responseType: 'json',
            },
        );
        announce(reply.headers);
        if (reply.status === 304) return null;
        if (!reply.ok) throw failure(reply, source.isPrivate);
        errors.assert(!reply.body.truncated, 'Repository tree is truncated', 'failed');
        return { etag: reply.headers.etag ?? null, tree: reply.body };
    },

    /** Файл репозитория; fallback: null - null вместо not_found. */
    file,

    /** Тег последнего релиза; без токена - github.com, не API. */
    async release(ref: GithubRepoRef, token: string | null): Promise<string> {
        const reply = token === null
            ? await web.send<{ tag_name: string }>(`/${slug(ref)}/releases/latest`, { responseType: 'json' })
            : await api.send<{ tag_name: string }>(`/repos/${slug(ref)}/releases/latest`, {
                headers: bearer(token),
                responseType: 'json',
            });
        if (!reply.ok) throw failure(reply, token !== null);
        return reply.body.tag_name;
    },

    /** Репозиторий источника глазами токена. */
    async probe(source: SourceRecord, token: string | null): Promise<GithubRepo> {
        const reply = await api.send<{ full_name: string; private: boolean }>(`/repos/${slug(parse(source))}`, {
            headers: bearer(token),
        });
        if (!reply.ok) throw failure(reply, source.isPrivate);
        return { fullName: reply.body.full_name, isPrivate: reply.body.private };
    },

    /** Лимиты токенов и анонимный; сбой пробы - данные строки. */
    async limit(): Promise<GithubLimit> {
        const sources = await store.list();
        const probes = await Promise.all(
            sources.map(async (source): Promise<GithubLimitEntry | null> => {
                const sourceName = source.name || source.url;
                try {
                    const token = await tokens.get(source.id);
                    return token === null ? null : await quota(source.id, sourceName, token);
                } catch (e) {
                    return { sourceId: source.id, sourceName, ok: false, error: errors.explain(e).message };
                }
            }),
        );
        const anonymous = await quota(null, 'anonymous', null);
        const entries = probes.filter((entry): entry is GithubLimitEntry => entry !== null);
        return { fetchedAt: Date.now(), entries: [...entries, anonymous] };
    },
};
