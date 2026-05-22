const KNOWN_ERROR_KEYS = new Set([
    'sources.tokenInvalid',
    'sources.tokenNoAccess',
    'sources.repoNotFound',
]);

export function toErrorKey(err: unknown): string {
    const msg = err instanceof Error ? err.message : '';
    for (const key of KNOWN_ERROR_KEYS) {
        if (msg.includes(key)) return key;
    }
    return 'error';
}
