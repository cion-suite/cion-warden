import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import { errors } from '@cion-suite/core/renderer';

import { githubFailure } from '@/lib/github-error';

// Ключ вместо перевода: сверяем выбор фразы
const t = ((key: string) => key) as unknown as TFunction;

describe('githubFailure: фраза тоста по отказу GitHub', () => {
    it.each([401, 403])('unauthorized %i -> sources.tokenInvalid', (status) => {
        const e = errors.fail('unauthorized', 'GitHub token is invalid', { status });

        expect(githubFailure(e, t)).toEqual({ phrase: 'sources.tokenInvalid' });
    });

    it('forbidden (404 у private) -> sources.tokenNoAccess', () => {
        const e = errors.fail('forbidden', 'Token has no access to the repository', { status: 404 });

        expect(githubFailure(e, t)).toEqual({ phrase: 'sources.tokenNoAccess' });
    });

    it('not_found со status 404 (public) -> sources.repoNotFound', () => {
        const e = errors.fail('not_found', 'Repository not found', { status: 404 });

        expect(githubFailure(e, t)).toEqual({ phrase: 'sources.repoNotFound' });
    });

    it('доменный not_found без status -> общая фраза с причиной', () => {
        const e = errors.fail('not_found', 'Library not found');

        expect(githubFailure(e, t)).toEqual({ phrase: 'error', cause: e });
    });

    it('rate_limited -> общая фраза: текст main объясняет сам', () => {
        const e = errors.fail('rate_limited', 'GitHub rate limit exceeded. Resets at 12:00', { status: 403 });

        expect(githubFailure(e, t)).toEqual({ phrase: 'error', cause: e });
    });

    it('чужая ошибка -> общая фраза с причиной', () => {
        const e = new Error('boom');

        expect(githubFailure(e, t)).toEqual({ phrase: 'error', cause: e });
    });
});
