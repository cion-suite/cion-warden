type TFn = (key: string) => string;

const KNOWN_ERROR_KEYS = new Set([
    'sources.tokenInvalid',
    'sources.tokenNoAccess',
    'sources.repoNotFound',
    'vault.treeTruncated',
]);

const RATE_LIMIT_PREFIX = 'GitHub rate limit exceeded';

export function toErrorKey(err: unknown, t: TFn): string {
    const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
    if (msg.startsWith(RATE_LIMIT_PREFIX)) return msg;
    for (const key of KNOWN_ERROR_KEYS) {
        if (msg.includes(key)) return t(key);
    }
    return t('error');
}
