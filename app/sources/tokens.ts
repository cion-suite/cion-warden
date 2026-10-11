import { vault } from '@cion-suite/core';

const key = (sourceId: string): string => `source:token:${sourceId}`;

// Начало токена (тип и id) и конец видны, секрет скрыт
function hide(raw: string): string {
    if (raw.length < 8) return '***';

    let head: string;
    if (raw.startsWith('github_pat')) head = 'github_pat';
    else if (raw.startsWith('ghp')) head = 'ghp';
    else return `${raw[0]}***${raw[raw.length - 1]}`;

    const rest = raw.slice(head.length);
    const separator = rest.indexOf('_');
    if (separator < 0) return '***';

    const secret = rest.slice(separator + 1);
    if (secret.length < 2) return '***';

    return `${head}${rest.slice(0, separator)}_${secret[0]}***${secret[secret.length - 1]}`;
}

/** PAT источников в vault; сбой vault бросает. */
export const tokens = {
    /** null - токена нет. */
    get: (sourceId: string): Promise<string | null> => vault.get(key(sourceId)),
    set: (sourceId: string, token: string): Promise<void> => vault.set(key(sourceId), token),
    /** Нет токена - no-op. */
    remove: (sourceId: string): Promise<void> => vault.delete(key(sourceId)),
    /** Маска для UI; null - токена нет. */
    async mask(sourceId: string): Promise<string | null> {
        const raw = await vault.get(key(sourceId));
        return raw === null ? null : hide(raw);
    },
};
