// Связность конфига: CONFIG и electron-builder.json
// описывают одно приложение, иначе ломается updater.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '@shared/config';

const builder = (): { appId: string; publish: { provider: string; owner: string; repo: string; private?: boolean }[] } =>
    JSON.parse(readFileSync(resolve(__dirname, '../..', 'electron-builder.json'), 'utf8'));

describe('CONFIG', () => {
    it('appId - reverse-DNS без пробелов', () => {
        expect(CONFIG.appId).toMatch(/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/);
    });

    it('releases - непустой список owner/repo без дублей', () => {
        const slugs = CONFIG.releases.map((r) => `${r.owner}/${r.repo}`);

        expect(slugs.length).toBeGreaterThan(0);
        expect(new Set(slugs).size).toBe(slugs.length);
        for (const slug of slugs) expect(slug).toMatch(/^[\w.-]+\/[\w.-]+$/);
    });

    it('совпадает с electron-builder.json', () => {
        const stable = builder();

        expect(stable.appId).toBe(CONFIG.appId);
        expect(stable.publish).toEqual(
            CONFIG.releases.map((r) => ({ provider: 'github', owner: r.owner, repo: r.repo, ...('private' in r ? { private: true } : {}) })),
        );
    });
});
