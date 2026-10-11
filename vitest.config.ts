import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            '@app': resolve('app'),
            '@shared': resolve('shared'),
            '@': resolve('src'),
            // Реальный electron-log виснет под node
            'electron-log/renderer': resolve('tests/support/electron-log-stub.ts'),
            'electron-log/main': resolve('tests/support/electron-log-stub.ts'),
        },
    },
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
    },
});
