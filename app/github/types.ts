export interface GithubTreeEntry {
    path: string;
    mode: string;
    type: 'blob' | 'tree' | 'commit';
    sha: string;
    size?: number;
    url: string;
}

export interface GithubTree {
    sha: string;
    url: string;
    tree: GithubTreeEntry[];
    truncated: boolean;
}

/** Ответ tree: etag и дерево; null на 304 - дерево не менялось. */
export interface GithubTreeReply {
    etag: string | null;
    tree: GithubTree;
}
