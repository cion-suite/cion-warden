// Invariant (CLAUDE.md "Before first ship"):
//   APP_ID ≡ electron-builder.json[appId].
// Auto-updater feed is baked into app-update.yml at build time from
// electron-builder.json[publish[0]] — no runtime mirror needed here.

export const APP_ID = 'io.cion.warden';
export const PRODUCT_NAME = 'Cion Warden';
