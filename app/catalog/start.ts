import fs from 'node:fs/promises';
import { shell } from '@app/shell';
import { paths } from '@app/utils/paths';

export async function startCatalog(): Promise<void> {
    await fs.mkdir(paths.vault(), { recursive: true });
    shell.splash.update({ progress: 50, status: 'Registering handlers' });
}
