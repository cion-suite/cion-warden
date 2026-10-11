// Модуль связывает каналы github и порядок запуска.
import { describe, expect, it } from 'vitest';
import { githubHandlers } from '@app/github/handlers';
import { githubModule } from '@app/github/module';
import { sourcesModule } from '@app/sources/module';

describe('githubModule', () => {
    it('id, каналы и зависимость от sources', () => {
        expect(githubModule.id).toBe('github');
        expect(githubModule.handlers).toEqual([githubHandlers]);
        expect(githubModule.needs).toEqual([sourcesModule]);
    });
});
