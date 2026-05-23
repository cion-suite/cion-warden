export interface GithubRateLimitResource {
    limit: number;
    used: number;
    remaining: number;
    reset: number;
}

export interface GithubRateLimitEntry {
    /** Null for anonymous probe. */
    sourceId: string | null;
    sourceName: string;
    ok: boolean;
    error?: string;
    core?: GithubRateLimitResource;
    search?: GithubRateLimitResource;
}

export interface GithubRateLimitResult {
    fetchedAt: number;
    entries: GithubRateLimitEntry[];
}
