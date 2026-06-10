import { ipc } from '@cion-suite/core/ipc';
import type { GithubRateLimitResult } from '@shared/types/github.js';
import type { AppServices } from '../types/services.js';
import { getGithubRateLimits } from '../services/github-rate-limit.js';

export function registerGithubHandlers(services: AppServices): void {
    const { logger, sourceTokens } = services;

    ipc.register({
        'github:rate-limit': async (): Promise<GithubRateLimitResult> =>
            getGithubRateLimits({ tokens: sourceTokens, logger }),
    });
}
