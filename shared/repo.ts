import type { GithubRepoRef } from './types/github';

/** Ссылки на репозитории GitHub. */
export const repo = {
    // Хост якорится на границе, иначе пройдут notgithub.com и
    // evil-github.com.attacker.tld. Формы: https://, git@, bare
    parse(url: string): GithubRepoRef | null {
        const m = url.match(/(?:^|\/\/|@)github\.com[/:]([^/\s:]+)\/([^/\s]+?)(?:\.git)?(?:[/?#]|$)/);
        if (!m?.[1] || !m[2]) return null;
        return { owner: m[1], repo: m[2] };
    },

    /** `owner/repo` для GitHub, иначе два последних сегмента пути. */
    name(url: string): string {
        const parsed = repo.parse(url);
        if (parsed) return `${parsed.owner}/${parsed.repo}`;
        try {
            const parts = new URL(url).pathname.replace(/\.git$/, '').split('/').filter(Boolean);
            if (parts.length >= 2) return parts.slice(-2).join('/');
            if (parts.length === 1) return parts[0]!;
        } catch {
            // невалидный URL: имя - сам url
        }
        return url;
    },
};
