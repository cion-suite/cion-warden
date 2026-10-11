// Инвариант: appId и feeds == electron-builder.<channel>.json
// (CLAUDE.md "Before first ship"); без импортов: читает скрипт

export const CONFIG = {
    appId: 'io.cion.warden',
    productName: 'Cion Warden',
    feeds: {
        latestUrl: 'https://example.com/updates/latest/',
        betaUrl: 'https://example.com/updates/beta/',
    },
} as const;
