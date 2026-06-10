import { ipc } from '@cion-suite/core/ipc';
import type { FontInstallSummary, InstalledFont } from '@shared/types/assets.js';
import type { AppServices } from '../types/services.js';
import { listSources } from '../services/sources-store.js';
import {
    installSourceFonts,
    listInstalledFonts,
    uninstallSourceFonts,
} from '../services/font-install.js';
import { requireString } from '../utils/ipc-args.js';

export function registerFontHandlers(services: AppServices, vaultBase: string): void {
    const { logger, sourceTokens } = services;

    ipc.register({
        'fonts:install-source': async (
            _event,
            rawSourceId: unknown,
        ): Promise<FontInstallSummary> => {
            const sourceId = requireString(rawSourceId, 'sourceId');
            const sources = await listSources(logger);
            const source = sources.find((s) => s.id === sourceId);
            if (!source) throw new Error(`Source not found: ${sourceId}`);
            return installSourceFonts(source, { vaultBase, tokens: sourceTokens, logger });
        },

        'fonts:uninstall-source': async (_event, rawSourceId: unknown): Promise<void> => {
            const sourceId = requireString(rawSourceId, 'sourceId');
            await uninstallSourceFonts(sourceId, { logger });
        },

        'fonts:list-installed': async (): Promise<InstalledFont[]> => {
            return listInstalledFonts();
        },
    });
}
