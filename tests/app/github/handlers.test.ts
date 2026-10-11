import { beforeEach, describe, expect, it, vi } from 'vitest';

const github = vi.hoisted(() => ({ limit: vi.fn(), probe: vi.fn() }));
const store = vi.hoisted(() => ({ get: vi.fn() }));
const tokens = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@app/github', () => ({ github }));
vi.mock('@app/sources/store', () => ({ store }));
vi.mock('@app/sources/tokens', () => ({ tokens }));

import { githubHandlers } from '@app/github/handlers';

const source = { id: 'a', type: 'git', name: 'o/r', url: 'https://github.com/o/r', branch: 'main', isPrivate: true };

beforeEach(() => {
    github.limit.mockReset();
    github.probe.mockReset().mockResolvedValue({ fullName: 'o/r', isPrivate: true });
    store.get.mockReset().mockResolvedValue(source);
    tokens.get.mockReset().mockResolvedValue('tok');
});

describe('github:limit:get', () => {
    it('отдаёт лимиты github', async () => {
        github.limit.mockResolvedValue({ fetchedAt: 1, entries: [] });

        await expect(githubHandlers['github:limit:get']()).resolves.toEqual({ fetchedAt: 1, entries: [] });
    });
});

describe('github:repo:get', () => {
    it('проба репозитория с токеном источника', async () => {
        await expect(githubHandlers['github:repo:get'].handle('a')).resolves.toEqual({ fullName: 'o/r', isPrivate: true });

        expect(github.probe).toHaveBeenCalledWith(source, 'tok');
    });

    it('нет токена - unauthorized до запроса', async () => {
        tokens.get.mockResolvedValue(null);

        await expect(githubHandlers['github:repo:get'].handle('a')).rejects.toMatchObject({
            code: 'unauthorized',
            message: 'No token',
        });
        expect(github.probe).not.toHaveBeenCalled();
    });

    it('неизвестный источник - отказ store, токен не читается', async () => {
        store.get.mockRejectedValue(new Error('Source not found'));

        await expect(githubHandlers['github:repo:get'].handle('zzz')).rejects.toThrow('not found');
        expect(tokens.get).not.toHaveBeenCalled();
    });
});
