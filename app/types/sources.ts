import type { ExternalVaultSource, GitVaultSource } from '@shared/types/vault.js';

export type NewSource = Omit<GitVaultSource, 'id'> | Omit<ExternalVaultSource, 'id'>;
