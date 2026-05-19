export function requireString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`Invalid ${field}`);
    }
    return value;
}
