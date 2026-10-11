import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ send: vi.fn() }));
const raw = vi.hoisted(() => ({ send: vi.fn() }));
const web = vi.hoisted(() => ({ send: vi.fn() }));
const events = vi.hoisted(() => ({ emit: vi.fn() }));
const tokens = vi.hoisted(() => ({ get: vi.fn() }));
const store = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock('@app/sources/tokens', () => ({ tokens }));
vi.mock('@app/sources/store', () => ({ store }));
vi.mock('@cion-suite/core', async (importOriginal) => {
    const original = await importOriginal<typeof import('@cion-suite/core')>();
    return {
        ...original,
        events,
        http: {
            ...original.http,
            create: (options: { baseURL: string }) => {
                if (options.baseURL === 'https://github.com') return web;
                return options.baseURL.includes('api') ? api : raw;
            },
        },
    };
});

import { github } from '@app/github';

const pub = { id: 'p', type: 'git', name: 'o/r', url: 'https://github.com/o/r', branch: 'release/v1', isPrivate: false } as const;
const priv = { ...pub, id: 'q', isPrivate: true };

const ok = <T>(body: T, headers: Record<string, string> = {}) => ({ ok: true, status: 200, headers, body });
const bad = (status: number, headers: Record<string, string> = {}) => ({
    ok: false,
    status,
    headers,
    error: { code: 'unknown', message: `HTTP ${status}` },
});
const offline = (code: string) => ({ ok: false, headers: {}, error: { code, message: 'net::ERR' } });

beforeEach(() => {
    api.send.mockReset();
    raw.send.mockReset();
    web.send.mockReset();
    events.emit.mockReset();
    tokens.get.mockReset().mockResolvedValue('tok');
    store.list.mockReset();
});

describe('github.error', () => {
    it.each([
        [401, false, 'unauthorized', 'GitHub token is invalid'],
        [403, true, 'unauthorized', 'GitHub token is invalid'],
        [404, true, 'forbidden', 'Token has no access to the repository'],
        [404, false, 'not_found', 'Repository not found'],
        [500, false, 'failed', 'GitHub API error: 500'],
        [422, true, 'failed', 'GitHub API error: 422'],
    ])('HTTP %i (private: %s) -> %s', (status, isPrivate, code, message) => {
        expect(github.error(status, isPrivate)).toMatchObject({ code, message, status });
    });

    it('403 при remaining 0 - rate_limited с временем сброса', () => {
        const error = github.error(403, false, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1700000000' });

        expect(error).toMatchObject({ code: 'rate_limited', status: 403 });
        expect(error.message).toMatch(/^GitHub rate limit exceeded\. Resets at \S/);
    });

    it('403 с остатком лимита - токен, а не лимит; лимит на не-403 не играет', () => {
        const headers = { 'x-ratelimit-remaining': '10', 'x-ratelimit-reset': '1700000000' };

        expect(github.error(403, false, headers)).toMatchObject({ code: 'unauthorized' });
        expect(github.error(404, false, { ...headers, 'x-ratelimit-remaining': '0' })).toMatchObject({ code: 'not_found' });
    });

    it('403 без заголовка reset - не лимит', () => {
        expect(github.error(403, false, { 'x-ratelimit-remaining': '0' })).toMatchObject({ code: 'unauthorized' });
    });
});

describe('github.encode', () => {
    it('кодирует сегменты, слэш остаётся', () => {
        expect(github.encode('release/v 1/ф#')).toBe('release/v%201/%D1%84%23');
    });
});

describe('github.tree', () => {
    const tree = { sha: 's', url: 'u', truncated: false, tree: [{ path: 'scripts/a.ahk', type: 'blob', sha: 'x', mode: '100644', url: 'u' }] };

    it('200: дерево и etag, ветка с / кодируется по сегментам, публичный - без токена', async () => {
        api.send.mockResolvedValue(ok(tree, { etag: 'W/"1"' }));

        await expect(github.tree(pub)).resolves.toEqual({ etag: 'W/"1"', tree });

        const [url, init] = api.send.mock.calls[0];
        expect(url).toBe('/repos/o/r/git/trees/release/v1');
        expect(init).toMatchObject({ query: { recursive: 1 }, responseType: 'json' });
        expect(init.headers).toEqual({});
        expect(tokens.get).not.toHaveBeenCalled();
    });

    it('private: токен в authorization; etag уходит в if-none-match', async () => {
        api.send.mockResolvedValue(ok(tree));

        await github.tree(priv, 'W/"0"');

        expect(api.send.mock.calls[0][1].headers).toEqual({ authorization: 'Bearer tok', 'if-none-match': 'W/"0"' });
    });

    it('304 - null', async () => {
        api.send.mockResolvedValue(bad(304));

        await expect(github.tree(pub, 'e')).resolves.toBeNull();
    });

    it('truncated - failed', async () => {
        api.send.mockResolvedValue(ok({ ...tree, truncated: true }));

        await expect(github.tree(pub)).rejects.toMatchObject({ code: 'failed', message: 'Repository tree is truncated' });
    });

    it('ошибки по таблице: 404 private - forbidden, 404 public - not_found', async () => {
        api.send.mockResolvedValue(bad(404));

        await expect(github.tree(priv)).rejects.toMatchObject({ code: 'forbidden', status: 404 });
        await expect(github.tree(pub)).rejects.toMatchObject({ code: 'not_found', status: 404 });
    });

    it('лимит уходит событием и на ответе-отказе; без обоих заголовков - нет', async () => {
        api.send.mockResolvedValueOnce(ok(tree, { 'x-ratelimit-remaining': '59', 'x-ratelimit-reset': '1700000000' }));
        await github.tree(pub);
        expect(events.emit).toHaveBeenCalledWith('github:limit:changed', { remaining: 59, reset: 1700000000 });

        events.emit.mockClear();
        api.send.mockResolvedValueOnce(bad(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1700000000' }));
        await expect(github.tree(pub)).rejects.toMatchObject({ code: 'rate_limited' });
        expect(events.emit).toHaveBeenCalledWith('github:limit:changed', { remaining: 0, reset: 1700000000 });

        events.emit.mockClear();
        api.send.mockResolvedValueOnce(ok(tree, { 'x-ratelimit-remaining': '5' }));
        await github.tree(pub);
        expect(events.emit).not.toHaveBeenCalled();
    });

    it('нет ответа (сеть, дедлайн) - код транспорта сохраняется', async () => {
        api.send.mockResolvedValueOnce(offline('timeout'));
        await expect(github.tree(pub)).rejects.toMatchObject({ code: 'timeout' });

        api.send.mockResolvedValueOnce(offline('unknown'));
        await expect(github.tree(pub)).rejects.toMatchObject({ code: 'failed' });
    });

    it('не GitHub-ссылка - validation, запроса нет', async () => {
        await expect(github.tree({ ...pub, url: 'https://gitlab.com/o/r' })).rejects.toMatchObject({ code: 'validation' });
        expect(api.send).not.toHaveBeenCalled();
    });
});

describe('github.file', () => {
    it('public: raw-клиент, байты в Buffer, ветка и путь по сегментам', async () => {
        raw.send.mockResolvedValue(ok(new Uint8Array([104, 105])));

        const content = await github.file(pub, 'scripts/мой файл.ahk');

        expect(Buffer.isBuffer(content)).toBe(true);
        expect(content.toString()).toBe('hi');
        const [url, init] = raw.send.mock.calls[0];
        expect(url).toBe('/o/r/release/v1/scripts/%D0%BC%D0%BE%D0%B9%20%D1%84%D0%B0%D0%B9%D0%BB.ahk');
        expect(init).toMatchObject({ responseType: 'bytes', timeout: 120_000 });
        expect(api.send).not.toHaveBeenCalled();
    });

    it('private: contents API, accept raw, токен, ref в query', async () => {
        api.send.mockResolvedValue(ok(new Uint8Array([1])));

        await github.file(priv, 'lib/a.ahk');

        const [url, init] = api.send.mock.calls[0];
        expect(url).toBe('/repos/o/r/contents/lib/a.ahk');
        expect(init).toMatchObject({
            query: { ref: 'release/v1' },
            headers: { accept: 'application/vnd.github.raw', authorization: 'Bearer tok' },
            responseType: 'bytes',
            timeout: 120_000,
        });
    });

    it('private без токена: запрос анонимный, без предпроверки', async () => {
        tokens.get.mockResolvedValue(null);
        api.send.mockResolvedValue(bad(404));

        await expect(github.file(priv, 'a')).rejects.toMatchObject({ code: 'forbidden', status: 404 });
        expect(api.send.mock.calls[0][1].headers).not.toHaveProperty('authorization');
    });

    it('fallback: null - 404 даёт null без пробы репозитория', async () => {
        raw.send.mockResolvedValue(bad(404));

        await expect(github.file(pub, 'a', { fallback: null })).resolves.toBeNull();
        expect(api.send).not.toHaveBeenCalled();
    });

    it('fallback: null не прячет прочие отказы', async () => {
        raw.send.mockResolvedValue(bad(500));

        await expect(github.file(pub, 'a', { fallback: null })).rejects.toMatchObject({ code: 'failed', status: 500 });
    });

    it('public 404, репозитория нет - not_found со статусом 404', async () => {
        raw.send.mockResolvedValue(bad(404));
        api.send.mockResolvedValue(bad(404));

        await expect(github.file({ ...pub, url: 'https://github.com/gone/repo' }, 'a')).rejects.toMatchObject({
            code: 'not_found',
            status: 404,
            message: 'Repository not found',
        });
    });

    it('public 404, репозиторий жив - File not found без статуса; проба кешируется', async () => {
        raw.send.mockResolvedValue(bad(404));
        api.send.mockResolvedValue(ok({}));
        const source = { ...pub, url: 'https://github.com/alive/repo' };

        const first = await github.file(source, 'a/b.ahk').catch((e: unknown) => e);
        await expect(github.file(source, 'c.ahk')).rejects.toMatchObject({ code: 'not_found' });

        expect(first).toMatchObject({ code: 'not_found', message: 'File not found: a/b.ahk' });
        expect((first as { status?: number }).status).toBeUndefined();
        expect(api.send).toHaveBeenCalledTimes(1);
    });

    it('сбой пробы (не 404) не объявляет репозиторий несуществующим', async () => {
        raw.send.mockResolvedValue(bad(404));
        api.send.mockResolvedValue(bad(403));

        await expect(github.file({ ...pub, url: 'https://github.com/rl/repo' }, 'a')).rejects.toMatchObject({
            message: 'File not found: a',
        });
    });

    it('сеть: код транспорта', async () => {
        raw.send.mockResolvedValue(offline('network'));

        await expect(github.file(pub, 'a')).rejects.toMatchObject({ code: 'network' });
    });
});

describe('github.probe', () => {
    it('возвращает имя и приватность', async () => {
        api.send.mockResolvedValue(ok({ full_name: 'o/r', private: true }));

        await expect(github.probe(priv, 'tok')).resolves.toEqual({ fullName: 'o/r', isPrivate: true });
        expect(api.send.mock.calls[0][0]).toBe('/repos/o/r');
        expect(api.send.mock.calls[0][1].headers).toEqual({ authorization: 'Bearer tok' });
    });

    it('401 - unauthorized, 404 private - forbidden', async () => {
        api.send.mockResolvedValueOnce(bad(401));
        await expect(github.probe(priv, 'tok')).rejects.toMatchObject({ code: 'unauthorized', status: 401 });

        api.send.mockResolvedValueOnce(bad(404));
        await expect(github.probe(priv, 'tok')).rejects.toMatchObject({ code: 'forbidden', status: 404 });
    });
});

describe('github.release', () => {
    const ref = { owner: 'o', repo: 'r' };

    it('без токена - страница github.com, не API', async () => {
        web.send.mockResolvedValue(ok({ tag_name: 'v1.2.3' }));

        await expect(github.release(ref, null)).resolves.toBe('v1.2.3');
        expect(web.send.mock.calls[0][0]).toBe('/o/r/releases/latest');
        expect(api.send).not.toHaveBeenCalled();
    });

    it('с токеном - API с bearer', async () => {
        api.send.mockResolvedValue(ok({ tag_name: 'v2.0.0' }));

        await expect(github.release(ref, 'tok')).resolves.toBe('v2.0.0');
        expect(api.send.mock.calls[0][0]).toBe('/repos/o/r/releases/latest');
        expect(api.send.mock.calls[0][1].headers).toEqual({ authorization: 'Bearer tok' });
        expect(web.send).not.toHaveBeenCalled();
    });

    it('сегменты owner и repo кодируются', async () => {
        web.send.mockResolvedValue(ok({ tag_name: 'v1.0.0' }));

        await github.release({ owner: 'o w', repo: 'r/x' }, null);

        expect(web.send.mock.calls[0][0]).toBe('/o%20w/r%2Fx/releases/latest');
    });

    it('сбой с токеном: 401 - unauthorized, 404 - forbidden', async () => {
        api.send.mockResolvedValueOnce(bad(401));
        await expect(github.release(ref, 'tok')).rejects.toMatchObject({ code: 'unauthorized', status: 401 });

        api.send.mockResolvedValueOnce(bad(404));
        await expect(github.release(ref, 'tok')).rejects.toMatchObject({ code: 'forbidden', status: 404 });
    });

    it('сбой без токена: 404 - not_found, сеть - код транспорта', async () => {
        web.send.mockResolvedValueOnce(bad(404));
        await expect(github.release(ref, null)).rejects.toMatchObject({ code: 'not_found', status: 404 });

        web.send.mockResolvedValueOnce(offline('timeout'));
        await expect(github.release(ref, null)).rejects.toMatchObject({ code: 'timeout' });
    });
});

describe('github.limit', () => {
    const resources = { core: { limit: 60, used: 1, remaining: 59, reset: 1 }, search: { limit: 10, used: 0, remaining: 10, reset: 2 } };

    it('по токенам источников и анонимный; источники без токена пропускаются', async () => {
        store.list.mockResolvedValue([pub, { ...priv, name: '' }]);
        tokens.get.mockImplementation(async (id: string) => (id === 'q' ? 'tok' : null));
        api.send.mockResolvedValue(ok({ resources }));

        const result = await github.limit();

        expect(result.entries).toEqual([
            { sourceId: 'q', sourceName: pub.url, ok: true, ...resources },
            { sourceId: null, sourceName: 'anonymous', ok: true, ...resources },
        ]);
        expect(api.send.mock.calls[0][1].headers).toEqual({ authorization: 'Bearer tok' });
        expect(api.send.mock.calls[1][1].headers).toEqual({});
    });

    it('сбой пробы и сбой vault - данные строки, канал не падает', async () => {
        store.list.mockResolvedValue([priv, { ...priv, id: 'r' }]);
        tokens.get.mockImplementation(async (id: string) => {
            if (id === 'r') throw new Error('vault down');
            return 'tok';
        });
        api.send.mockResolvedValueOnce(bad(401)).mockResolvedValueOnce(ok({ resources }));

        const { entries } = await github.limit();

        expect(entries).toEqual([
            expect.objectContaining({ sourceId: 'q', ok: false, error: 'HTTP 401' }),
            expect.objectContaining({ sourceId: 'r', ok: false, error: 'vault down' }),
            expect.objectContaining({ sourceId: null, ok: true }),
        ]);
    });

    it('сбой чтения источников пробрасывается', async () => {
        store.list.mockRejectedValue(new Error('sources.json is corrupted'));

        await expect(github.limit()).rejects.toThrow('corrupted');
    });
});
