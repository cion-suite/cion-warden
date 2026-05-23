export const GITHUB_API = 'https://api.github.com';
export const GITHUB_USER_AGENT = 'cion-warden/1.0';
export const GITHUB_FETCH_TIMEOUT_MS = 20_000;

// Wraps fetch with an AbortController timeout. Without it, a stuck connection
// leaves syncSource's inflight promise unresolved forever and every
// subsequent call deduplicates onto it.
export async function fetchWithTimeout(input: string, init: RequestInit = {}, timeoutMs = GITHUB_FETCH_TIMEOUT_MS): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(input, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

export interface GithubProbeResult {
    ok: boolean;
    status: number;
    statusText: string;
}

export interface RateLimitInfo {
    remaining: number;
    reset: number;
}

export function readRateLimit(res: Response): RateLimitInfo | null {
    const remaining = res.headers.get('x-ratelimit-remaining');
    const reset = res.headers.get('x-ratelimit-reset');
    if (remaining == null || reset == null) return null;
    return { remaining: Number(remaining), reset: Number(reset) };
}

/** Encode a git ref for URL path: preserve '/' so 'release/v1' stays addressable. */
export function encodeBranchRef(branch: string): string {
    return branch.split('/').map(encodeURIComponent).join('/');
}

export function encodeRepoPath(repoPath: string): string {
    return repoPath.split('/').map(encodeURIComponent).join('/');
}

export function isRateLimited(status: number, rateLimit: RateLimitInfo | null): boolean {
    if (status !== 403 || !rateLimit) return false;
    return Number.isFinite(rateLimit.remaining) && rateLimit.remaining <= 0;
}

export function rateLimitMessage(info: RateLimitInfo): string {
    const at = new Date(info.reset * 1000).toLocaleTimeString();
    return `GitHub rate limit exceeded. Resets at ${at}`;
}

export function mapGithubError(
    status: number,
    isPrivate: boolean,
    rateLimit: RateLimitInfo | null,
): Error {
    if (isRateLimited(status, rateLimit)) return new Error(rateLimitMessage(rateLimit!));
    if (status === 401 || status === 403) return new Error('sources.tokenInvalid');
    if (status === 404 && isPrivate) return new Error('sources.tokenNoAccess');
    if (status === 404) return new Error('sources.repoNotFound');
    return new Error(`GitHub API error: ${status}`);
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
    const res = await fetchWithTimeout(`${GITHUB_API}/repos/${owner}/${repo}`, { headers });
    return { ok: res.ok, status: res.status, statusText: res.statusText };
}

export interface GithubTreeEntry {
    path: string;
    mode: string;
    type: 'blob' | 'tree' | 'commit';
    sha: string;
    size?: number;
    url: string;
}

export interface GithubTreeResponse {
    sha: string;
    url: string;
    tree: GithubTreeEntry[];
    truncated: boolean;
}

export type TreeFetchResult =
    | { kind: 'modified'; etag: string | null; tree: GithubTreeResponse; rateLimit: RateLimitInfo | null }
    | { kind: 'not-modified'; rateLimit: RateLimitInfo | null }
    | { kind: 'error'; status: number; statusText: string; rateLimit: RateLimitInfo | null };

export async function fetchTree(opts: {
    owner: string;
    repo: string;
    branch: string;
    token?: string | null;
    etag?: string | null;
}): Promise<TreeFetchResult> {
    const { owner, repo, branch, token, etag } = opts;
    const headers: Record<string, string> = {
        'User-Agent': GITHUB_USER_AGENT,
        Accept: 'application/vnd.github+json',
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (etag) headers['If-None-Match'] = etag;

    const url = `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${encodeBranchRef(branch)}?recursive=1`;
    const res = await fetchWithTimeout(url, { headers });
    const rateLimit = readRateLimit(res);

    if (res.status === 304) return { kind: 'not-modified', rateLimit };
    if (!res.ok) return { kind: 'error', status: res.status, statusText: res.statusText, rateLimit };

    const tree = (await res.json()) as GithubTreeResponse;
    return { kind: 'modified', etag: res.headers.get('etag'), tree, rateLimit };
}
