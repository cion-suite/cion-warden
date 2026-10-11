// Инвариант: appId и feeds == electron-builder.json
// (CLAUDE.md "Before first ship"); без импортов: читает скрипт

export const CONFIG = {
    appId: 'io.cion.warden',
    productName: 'Cion Warden',
    feeds: {
        latestUrl: 'https://example.com/updates/latest/',
    },
} as const;
