import type { Logger } from '@cion-suite/core/log';

export type UpdaterChannel = 'beta' | 'latest';

export interface UpdaterFeed {
    latestUrl: string;
    betaUrl?: string;
}

export interface CreateAutoUpdaterOptions {
    appId: string;
    feed: UpdaterFeed;
    logger?: Logger;
    storeName?: string;
    checkInterval?: number;
    initialDelay?: number;
}

export interface AutoUpdaterController {
    isUpdateDownloaded: () => boolean;
    installPendingUpdate: () => void;
    dispose: () => void;
}
