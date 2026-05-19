export function maskToken(raw: string): string {
    if (raw.length < 8) return '***';

    let head: string;
    if (raw.startsWith('github_pat')) head = 'github_pat';
    else if (raw.startsWith('ghp')) head = 'ghp';
    else return `${raw[0]}***${raw[raw.length - 1]}`;

    const rest = raw.slice(head.length);
    const sepIdx = rest.indexOf('_');
    if (sepIdx < 0) return '***';

    const prefix = `${head}${rest.slice(0, sepIdx)}`;
    const secret = rest.slice(sepIdx + 1);
    if (secret.length < 2) return '***';

    return `${prefix}_${secret[0]}***${secret[secret.length - 1]}`;
}
