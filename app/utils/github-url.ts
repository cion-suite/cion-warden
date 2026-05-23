export interface ParsedGithubRepo {
    owner: string;
    repo: string;
}

// Anchor the host to a real boundary (scheme-separator, ssh user@, or string
// start) so look-alike domains (notgithub.com, evil-github.com.attacker.tld)
// don't slip through. Accepts: https://github.com/x/y, git@github.com:x/y,
// github.com/x/y (bare).
export function parseGithubUrl(url: string): ParsedGithubRepo | null {
    const m = url.match(/(?:^|\/\/|@)github\.com[/:]([^/\s:]+)\/([^/\s]+?)(?:\.git)?(?:[/?#]|$)/);
    if (!m?.[1] || !m[2]) return null;
    return { owner: m[1], repo: m[2] };
}

export function deriveGitName(url: string): string {
    const parsed = parseGithubUrl(url);
    if (parsed) return `${parsed.owner}/${parsed.repo}`;
    try {
        const u = new URL(url);
        const parts = u.pathname.replace(/\.git$/, '').split('/').filter(Boolean);
        if (parts.length >= 2) return parts.slice(-2).join('/');
        if (parts.length === 1) return parts[0]!;
    } catch {
        // ignore malformed URLs
    }
    return url;
}
