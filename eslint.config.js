import cionEslint from '@cion-suite/config/eslint';
import cionReact from '@cion-suite/config/eslint/react';
import cionFsd from '@cion-suite/config/eslint/fsd';

export default [
    ...cionEslint,
    ...cionReact,
    ...cionFsd,
    {
        name: 'cion-warden/scripts',
        files: ['scripts/**/*.{js,mjs,cjs}'],
        languageOptions: {
            globals: {
                process: 'readonly',
                console: 'readonly',
            },
        },
        rules: {
            'no-console': 'off',
        },
    },
    {
        name: 'cion-warden/ignores',
        ignores: ['build/**', 'src/shared/ui/shadcn/**'],
    },
];
