// Связность конфига: CONFIG и electron-builder.<channel>.json
// описывают одно приложение, иначе ломается updater.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '@shared/config';

const builder = (name: string): { appId: string; publish: { url: string }[] } =>
    JSON.parse(readFileSync(resolve(__dirname, '../..', name), 'utf8'));

describe('CONFIG', () => {
    it('appId - reverse-DNS без пробелов', () => {
        expect(CONFIG.appId).toMatch(/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/);
    });

    it('feed-адреса - валидные URL с завершающим слэшем', () => {
        // Имя файла фида (latest.yml) дописывается к адресу как есть
        for (const url of [CONFIG.feeds.latestUrl, CONFIG.feeds.betaUrl]) {
            expect(() => new URL(url)).not.toThrow();
            expect(url.endsWith('/')).toBe(true);
        }
    });

    it('каналы не делят один адрес', () => {
        expect(CONFIG.feeds.latestUrl).not.toBe(CONFIG.feeds.betaUrl);
    });

    it('совпадает с electron-builder.json', () => {
        const stable = builder('electron-builder.json');

        expect(stable.appId).toBe(CONFIG.appId);
        expect(stable.publish[0].url).toBe(CONFIG.feeds.latestUrl);
    });

    it('совпадает с electron-builder.beta.json', () => {
        expect(builder('electron-builder.beta.json').publish[0].url).toBe(CONFIG.feeds.betaUrl);
    });
});
