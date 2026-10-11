export interface GithubLimitResource {
    limit: number;
    used: number;
    remaining: number;
    reset: number;
}

/** Одна проба; сбой пробы - данные строки, не отказ канала. */
export interface GithubLimitEntry {
    /** null - анонимная проба. */
    sourceId: string | null;
    sourceName: string;
    ok: boolean;
    error?: string;
    core?: GithubLimitResource;
    search?: GithubLimitResource;
}

export interface GithubLimit {
    fetchedAt: number;
    entries: GithubLimitEntry[];
}

/** Разобранная ссылка на репозиторий. */
export interface GithubRepoRef {
    owner: string;
    repo: string;
}

/** Репозиторий источника глазами его токена (github:repo:get). */
export interface GithubRepo {
    fullName: string;
    isPrivate: boolean;
}
