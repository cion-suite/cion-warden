import type { GitVaultSource } from '@shared/types/vault.js';

export type NewSource = Omit<GitVaultSource, 'id'>;
