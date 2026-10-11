// Связность конфига: CONFIG и electron-builder.json
// описывают одно приложение, иначе ломается updater.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '@shared/config';

const builder = (): { appId: string; publish: { url: string }[] } =>
    JSON.parse(readFileSync(resolve(__dirname, '../..', 'electron-builder.json'), 'utf8'));

describe('CONFIG', () => {
    it('appId - reverse-DNS без пробелов', () => {
        expect(CONFIG.appId).toMatch(/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/);
    });

    it('feed-адрес - валидный URL с завершающим слэшем', () => {
        // Имя файла фида (latest.yml) дописывается к адресу как есть
        expect(() => new URL(CONFIG.feeds.latestUrl)).not.toThrow();
        expect(CONFIG.feeds.latestUrl.endsWith('/')).toBe(true);
    });

    it('совпадает с electron-builder.json', () => {
        const stable = builder();

        expect(stable.appId).toBe(CONFIG.appId);
        expect(stable.publish[0].url).toBe(CONFIG.feeds.latestUrl);
    });
});
