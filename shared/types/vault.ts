export type VaultSourceType = 'git';

export interface GitVaultSource {
    id: string;
    type: 'git';
    name: string;
    url: string;
    branch: string;
    isPrivate: boolean;
    /** Computed at listSources from secure-store; never persisted in sources.json. */
    hasToken?: boolean;
}

export type VaultSource = GitVaultSource;
