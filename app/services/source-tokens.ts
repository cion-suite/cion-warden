import type { Logger } from '@cion-suite/core/log';
import type { SecureStorage } from '@cion-suite/core/storage';
import { maskToken } from '../utils/mask-pat.js';

export interface SourceTokens {
    setToken(sourceId: string, token: string): Promise<void>;
    getToken(sourceId: string): Promise<string | null>;
    removeToken(sourceId: string): Promise<void>;
    hasToken(sourceId: string): Promise<boolean>;
    getTokenMask(sourceId: string): Promise<string | null>;
}

interface Deps {
    storage: SecureStorage;
    logger: Logger;
}

function keyOf(sourceId: string): string {
    return `source:token:${sourceId}`;
}

export function createSourceTokens({ storage, logger }: Deps): SourceTokens {
    return {
        async setToken(sourceId, token) {
            const trimmed = token.trim();
            if (trimmed.length === 0) throw new Error('Invalid token');
            await storage.set(keyOf(sourceId), trimmed);
        },

        async getToken(sourceId) {
            try {
                return await storage.get(keyOf(sourceId));
            } catch (err) {
                logger.error('source-tokens.get', err);
                return null;
            }
        },

        async removeToken(sourceId) {
            try {
                await storage.delete(keyOf(sourceId));
            } catch (err) {
                logger.error('source-tokens.remove', err);
            }
        },

        async hasToken(sourceId) {
            try {
                return await storage.has(keyOf(sourceId));
            } catch (err) {
                logger.error('source-tokens.has', err);
                return false;
            }
        },

        async getTokenMask(sourceId) {
            try {
                const raw = await storage.get(keyOf(sourceId));
                return raw ? maskToken(raw) : null;
            } catch (err) {
                logger.error('source-tokens.mask', err);
                return null;
            }
        },
    };
}
