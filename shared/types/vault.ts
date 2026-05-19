export type VaultSourceType = 'git' | 'external';

export interface GitVaultSource {
    id: string;
    type: 'git';
    name: string;
    url: string;
    branch: string;
    isPrivate: boolean;
}

export interface ExternalVaultSource {
    id: string;
    type: 'external';
    name: string;
    scriptsUrl: string;
    libsUrl: string;
    cfgUrl: string;
}

export type VaultSource = GitVaultSource | ExternalVaultSource;
