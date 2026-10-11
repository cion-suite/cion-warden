import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

const workspacePackages = ['@cion-suite/core'];

const backAlias = {
    '@app': resolve('app'),
    '@shared': resolve('shared'),
};

export default defineConfig({
    main: {
        esbuild: { charset: 'utf8' },
        resolve: { alias: backAlias },
        build: {
            outDir: 'build/out/main',
            rollupOptions: {
                input: { index: resolve(import.meta.dirname, 'app/main.ts') },
            },
            externalizeDeps: { exclude: workspacePackages },
        },
    },
    preload: {
        esbuild: { charset: 'utf8' },
        resolve: { alias: backAlias },
        build: {
            outDir: 'build/out/preload',
            rollupOptions: {
                input: { index: resolve(import.meta.dirname, 'app/preload.ts') },
                output: {
                    format: 'cjs',
                    entryFileNames: '[name].js',
                },
                external: ['electron'],
            },
            externalizeDeps: { exclude: workspacePackages },
        },
    },
    renderer: {
        root: '.',
        resolve: {
            alias: {
                '@': resolve('src'),
                '@shared': resolve('shared'),
            },
            dedupe: ['react', 'react-dom'],
        },

        define: {
            __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
        },
        build: {
            outDir: 'build/out/renderer',
            target: 'esnext',
            rollupOptions: {
                input: resolve(import.meta.dirname, 'index.html'),
            },
        },
        server: {
            port: 5173,
            strictPort: true,
        },
        plugins: [
            react({
                babel: {
                    plugins: [
                        [
                            'babel-plugin-react-compiler',
                            {
                                sources: (filename: string) =>
                                    filename.includes('/src/') || filename.includes('\\src\\'),
                            },
                        ],
                    ],
                },
            }),
            tailwindcss(),
        ],
    },
});
