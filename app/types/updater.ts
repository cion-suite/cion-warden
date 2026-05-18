import type { Logger } from '@cion-suite/core/log';

export interface CreateAutoUpdaterOptions {
    logger?: Logger;
    checkInterval?: number;
    initialDelay?: number;
}

export interface AutoUpdaterController {
    isUpdateDownloaded: () => boolean;
    installPendingUpdate: () => void;
    dispose: () => void;
}
