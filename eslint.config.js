import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';
import core from '@cion-suite/core/eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

// Правила импортов: CLAUDE.md, раздел 3, docs/standard.md.
// Решает последнее совпавшее: запреты стоят по краям.

const LOWER = ['kit', 'ui', 'lib'];
// Нижние слои: kit - только баррель модуля,
// ui и lib - любой файл.
const BELOW = [{ type: 'kit', internalPath: 'index.ts' }, { type: ['ui', 'lib'] }];
// Импорты внутри модуля kit плагин не проверяет по умолчанию.
const INTERNAL = { relationship: { to: 'internal' } };
// Экран `<Имя>Page.tsx` импортирует только маршрутизатор.
const PAGES = ['entity-page', 'shell-page'];
// Шаблон подставляет сущность импортёра:
// "та же сущность" одним селектором.
const SAME_ENTITY = { captured: { entity: '{{ from.captured.entity }}' } };

// Первые сегменты каналов shared/types/ipc-channels.ts
const WINDOW_NS = '^(app|updater|system|settings|events|scripts|sources|github|catalog|libs|binds|fonts)$';
const NS_MESSAGE = "window.<ns> гарантирован preload'ом - проверка и опциональная цепочка не нужны.";
const HTTP_MESSAGE = 'HTTP - только через http / http.create из @cion-suite/core.';

export default defineConfig([
    globalIgnores(['dist', 'build/**', 'src/ui/shadcn/**']),
    {
        files: ['**/*.{ts,tsx}'],
        extends: [
            js.configs.recommended,
            tseslint.configs.recommended,
            reactHooks.configs.flat.recommended,
            reactRefresh.configs.vite,
        ],
        languageOptions: {
            ecmaVersion: 2020,
            globals: globals.browser,
        },
        rules: {
            'no-restricted-syntax': [
                'error',
                {
                    selector: 'TSTypeReference > TSQualifiedName[left.name="Electron"]',
                    message: 'Import Electron types explicitly instead of referencing the global Electron namespace.',
                },
                // Без перечня namespace ловится и локальная
                // `window` (BrowserWindow) в app/.
                {
                    selector: [
                        `MemberExpression[optional=true][object.type='MemberExpression'][object.object.name='window'][object.property.name=/${WINDOW_NS}/]`,
                        `MemberExpression[optional=true][object.name='window'][property.name=/${WINDOW_NS}/]`,
                        `UnaryExpression[operator=/^(!|typeof)$/] > MemberExpression.argument[object.name='window'][property.name=/${WINDOW_NS}/]`,
                    ].join(', '),
                    message: NS_MESSAGE,
                },
            ],
            'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
        },
    },
    ...core.configs.recommended,
    {
        files: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}', 'shared/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            // time/timeEnd - замер transform, в журнал не идёт
            'no-console': ['error', { allow: ['time', 'timeEnd'] }],
            '@typescript-eslint/no-confusing-void-expression': [
                'error',
                { ignoreArrowShorthand: true, ignoreVoidOperator: true },
            ],
        },
    },
    // Голый fetch в renderer обходит корпоративный CA и прокси.
    // В main то же держит плагин ядра (primitives).
    {
        files: ['src/**/*.{ts,tsx}', 'tests/src/**/*.{ts,tsx}'],
        rules: {
            'no-restricted-globals': ['error', { name: 'fetch', message: HTTP_MESSAGE }],
            'no-restricted-properties': [
                'error',
                { object: 'globalThis', property: 'fetch', message: HTTP_MESSAGE },
                { object: 'window', property: 'fetch', message: HTTP_MESSAGE },
            ],
        },
    },
    // Renderer и shared живут в бандле окна: main-код и electron
    // туда не тянем: `@app/*` в tsconfig.front.json - для типов.
    {
        name: 'cion-warden/no-main-imports',
        files: ['src/**/*.{ts,tsx}', 'shared/**/*.{ts,tsx}'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        { group: ['@app/*'], message: 'main-код недоступен renderer и shared' },
                        { group: ['electron', 'electron/*'], message: 'electron - только в app/' },
                    ],
                },
            ],
        },
    },

    // shared/ исполняется в main.
    // Стоит после recommended: решает последнее совпадение.
    {
        name: 'cion-warden/shared-primitives',
        files: ['shared/**/*.{ts,tsx}', 'tests/shared/**/*.{ts,tsx}'],
        rules: { '@cion-suite/core/primitives': ['error', { main: true }] },
    },
    {
        name: 'cion-warden/scripts',
        files: ['scripts/**/*.{js,mjs,cjs}', '.claude/scripts/**/*.mjs'],
        languageOptions: { globals: globals.node },
        rules: { 'no-console': 'off' },
    },
    {
        // Генерат shadcn (components.json hooks): руками не
        // правится, use-mobile ставит state из эффекта.
        name: 'cion-warden/shadcn-hooks',
        files: ['src/lib/hooks/ui/**'],
        rules: { 'react-hooks/set-state-in-effect': 'off' },
    },
    // Границы раскладки действуют только на src/**/*;
    // файлы вне src/ не классифицируются.
    {
        files: ['src/**/*.{ts,tsx}'],
        plugins: { boundaries },
        settings: {
            // Без root-path корень - cwd: из `src/` пути элементов
            // не совпадают и проверка молчит.
            'boundaries/root-path': import.meta.dirname,
            // Побеждает первый совпавший паттерн: экран и ядро
            // (mode: 'full') не попадают под паттерн части.
            'boundaries/elements': [
                { type: 'app', pattern: 'src/app/**' },
                { type: 'shell-page', pattern: 'src/shell/*/*Page.tsx', mode: 'full' },
                { type: 'shell', pattern: 'src/shell/**' },
                { type: 'entity-page', pattern: 'src/entities/*/*/*Page.tsx', mode: 'full', capture: ['entity', 'part'] },
                // Ядро - файлы в корне сущности, отдельной папки нет.
                { type: 'entity-core', pattern: 'src/entities/*/*.{ts,tsx}', mode: 'full', capture: ['entity'] },
                // Часть - папка целиком: импорты внутри неё не проверяются.
                { type: 'entity-part', pattern: 'src/entities/*/*', mode: 'folder', capture: ['entity', 'part'] },
                // Модуль kit - папка `src/kit/<модуль>`, internalPath от неё.
                { type: 'kit', pattern: 'src/kit/*' },
                { type: 'ui', pattern: 'src/ui/**' },
                { type: 'lib', pattern: 'src/lib/**' },
            ],
            'boundaries/include': ['src/**/*.{ts,tsx}'],
            // `import('...').T` и `typeof import('...')` плагин не считает
            // зависимостью - без узла правила обходятся.
            'boundaries/additional-dependency-nodes': [
                { selector: 'TSImportType > Literal', kind: 'type', name: 'import-type' },
            ],
            'import/resolver': {
                typescript: {
                    // Относительные пути резолвер считает от cwd:
                    // из `src/` алиас `@/...` не находится.
                    project: ['tsconfig.front.json', 'tsconfig.json'].map((f) => `${import.meta.dirname}/${f}`),
                    noWarnOnMultipleProjects: true,
                },
                node: true,
            },
        },
        rules: {
            // Файл вне элементов boundaries/dependencies пропускает молча.
            'boundaries/no-unknown-files': 'error',
            'boundaries/dependencies': [
                'error',
                {
                    default: 'disallow',
                    message: 'Import breaks the layout rules - docs/standard.md, "Правила импортов"',
                    checkInternals: true,
                    rules: [
                        // 4. kit - только через index.ts модуля. Первым: поздний
                        // allow вернёт право лишь на баррель.
                        {
                            from: { type: ['app', 'shell', 'shell-page', 'entity-core', 'entity-part', 'entity-page', 'kit'] },
                            disallow: { to: { type: 'kit' } },
                            message: 'kit импортируется только через index.ts модуля (@/kit/<модуль>) - docs/standard.md',
                        },
                        { allow: { dependency: INTERNAL } },
                        // 1. Направление: app -> shell | entities -> kit -> ui -> lib.
                        // app берёт экраны - исключение из правила 3.
                        { from: { type: 'app' }, allow: { to: [{ type: ['app', 'shell', 'entity-core', 'entity-part', ...PAGES] }, ...BELOW] } },
                        { from: { type: ['shell', 'shell-page'] }, allow: { to: [{ type: 'shell' }, ...BELOW] } },
                        { from: { type: 'kit' }, allow: { to: BELOW } },
                        { from: { type: 'ui' }, allow: { to: { type: ['ui', 'lib'] } } },
                        { from: { type: 'lib' }, allow: { to: { type: 'lib' } } },
                        // 2. Ядро сущности - нижние слои и своё же ядро.
                        {
                            from: { type: 'entity-core' },
                            allow: { to: [...BELOW, { type: 'entity-core', ...SAME_ENTITY }] },
                        },
                        // 3. Чужая сущность - только через index.ts,
                        // её собственный или её части.
                        {
                            from: { type: ['entity-part', 'entity-page'] },
                            allow: {
                                to: [
                                    ...BELOW,
                                    { type: ['entity-core', 'entity-part'], ...SAME_ENTITY },
                                    { type: 'entity-core', elementPath: 'src/entities/*/index.ts' },
                                    { type: 'entity-part', internalPath: 'index.ts' },
                                ],
                            },
                        },
                        // 4. Внутри модуля kit - не свой index.ts:
                        // баррель -> файл -> баррель замыкает цикл.
                        {
                            from: { type: 'kit' },
                            disallow: { to: { type: 'kit', internalPath: 'index.ts' }, dependency: INTERNAL },
                            message: 'Внутри модуля kit - импорт файла, не свой index.ts: баррель -> файл -> баррель даёт цикл',
                        },
                        // Экран - только из маршрутизатора. Последним: решает
                        // последнее совпавшее правило, запрет сильнее allow выше.
                        {
                            from: { type: ['shell', 'shell-page', 'entity-core', 'entity-part', 'entity-page', ...LOWER] },
                            disallow: { to: { type: PAGES } },
                            message: 'Pages are imported only by the router (src/app) - docs/standard.md',
                        },
                    ],
                },
            ],
        },
    },
]);
