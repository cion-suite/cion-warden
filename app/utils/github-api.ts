export const GITHUB_API = 'https://api.github.com';
export const GITHUB_USER_AGENT = 'cion-warden/1.0';

export interface GithubProbeResult {
    ok: boolean;
    status: number;
    statusText: string;
}

export async function probeRepo(
    owner: string,
    repo: string,
    token?: string,
): Promise<GithubProbeResult> {
    const headers: Record<string, string> = {
        'User-Agent': GITHUB_USER_AGENT,
        Accept: 'application/vnd.github+json',
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, { headers });
    return { ok: res.ok, status: res.status, statusText: res.statusText };
}
