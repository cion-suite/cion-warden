// Invariant (CLAUDE.md "Before first ship"):
//   APP_ID            ≡ electron-builder.json[appId]
//   FEED_URLS.latestUrl ≡ electron-builder.json[publish[0].url]
//   FEED_URLS.betaUrl   ≡ electron-builder.beta.json[publish[0].url]
// Drift breaks Windows toast routing and auto-updater feed resolution.

export const APP_ID = 'io.cion.template';
export const PRODUCT_NAME = 'Cion Template';

export const FEED_URLS = {
    latestUrl: 'https://example.com/updates/latest/',
    betaUrl: 'https://example.com/updates/beta/',
} as const;
