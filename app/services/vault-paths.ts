import path from 'node:path';
import { app } from 'electron';
import fs from 'node:fs/promises';

export function getGlobalVaultPath(): string {
    return path.join(app.getPath('userData'), 'global_vault');
}

export function getVaultPaths(vaultName: string) {
    const base = path.join(getGlobalVaultPath(), vaultName);
    return {
        base,
        scripts: path.join(base, 'scripts'),
        cfg: path.join(base, 'scripts', 'cfg'),
        lib: path.join(base, 'lib'),
        binds: path.join(base, 'binds'),
    };
}

export async function ensureGlobalVault(): Promise<void> {
    await fs.mkdir(getGlobalVaultPath(), { recursive: true });
}
