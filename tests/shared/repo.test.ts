import { describe, expect, it } from 'vitest';
import { repo } from '@shared/repo';

describe('repo.parse', () => {
    it('разбирает https, ssh и bare', () => {
        for (const url of ['https://github.com/o/r', 'https://github.com/o/r.git', 'git@github.com:o/r.git', 'github.com/o/r']) {
            expect(repo.parse(url)).toEqual({ owner: 'o', repo: 'r' });
        }
    });

    it('отвергает look-alike домены и не GitHub', () => {
        for (const url of ['https://notgithub.com/o/r', 'https://evil-github.com.attacker.tld/o/r', 'https://gitlab.com/g/r']) {
            expect(repo.parse(url)).toBeNull();
        }
    });
});

describe('repo.name', () => {
    it('owner/repo для GitHub и два последних сегмента для прочих', () => {
        expect(repo.name('https://github.com/o/r.git')).toBe('o/r');
        expect(repo.name('https://gitlab.com/g/sub/r.git')).toBe('sub/r');
        expect(repo.name('not a url')).toBe('not a url');
    });
});
