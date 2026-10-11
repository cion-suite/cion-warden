// Инвариант: appId и releases == electron-builder.json
// (CLAUDE.md "Before first ship"); без импортов: читает скрипт

export const CONFIG = {
    appId: 'io.cion.warden',
    productName: 'Cion Warden',
    // Одинаковые релизы в обоих репозиториях; private - нужен PAT
    releases: [
        { owner: 'Lazy-World', repo: 'wf-macro' },
        { owner: 'cion-suite', repo: 'cion-warden', private: true },
    ],
} as const;
