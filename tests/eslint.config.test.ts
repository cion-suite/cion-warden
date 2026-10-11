import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ESLint } from 'eslint';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Сломанный root-path или порядок правил boundaries отключают
// проверку молча: каждое правило раздела 3 CLAUDE.md
// обязано упасть.
// Файлы-пробы виртуальные; цели - временные настоящие файлы:
// плагин молчит про импорт, который не резолвится.

const cwd = resolve(import.meta.dirname, '..');

interface Case {
    name: string;
    file: string;
    target: string;
}
interface Violation extends Case {
    ruleId: string;
    // Подстрока текста сообщения: отличает правила с одним ruleId.
    text: string;
}

// Сущности и модуль kit для целей импорта. Префикс `__probe-`
// отличает их от настоящих, afterAll их удаляет.
const FIXTURES = [
    'src/entities/__probe-a/index.ts',
    'src/entities/__probe-a/types.ts',
    'src/entities/__probe-a/table/index.ts',
    'src/entities/__probe-a/table/ItemsPage.tsx',
    'src/kit/__probe-kit/index.ts',
    'src/kit/__probe-kit/Widget.ts',
];
const FIXTURE_DIRS = ['src/entities/__probe-a', 'src/kit/__probe-kit'];

const LAYOUT = 'layout rules';

const violations: Violation[] = [
    {
        name: 'rule 1: shell не импортирует сущность',
        file: 'src/shell/layout/__probe.ts',
        target: '@/entities/__probe-a',
        ruleId: 'boundaries/dependencies',
        text: LAYOUT,
    },
    {
        name: 'rule 2: ядро сущности не импортирует свою часть',
        file: 'src/entities/__probe-a/__probe.ts',
        target: '@/entities/__probe-a/table',
        ruleId: 'boundaries/dependencies',
        text: LAYOUT,
    },
    {
        name: 'rule 2: ядро сущности берёт ядро чужой сущности',
        file: 'src/entities/__probe-b/__probe.ts',
        target: '@/entities/__probe-a/types',
        ruleId: 'boundaries/dependencies',
        text: LAYOUT,
    },
    {
        name: 'rule 3: часть берёт чужую сущность не через index.ts',
        file: 'src/entities/__probe-b/profile/__probe.ts',
        target: '@/entities/__probe-a/types',
        ruleId: 'boundaries/dependencies',
        text: LAYOUT,
    },
    {
        name: 'rule 4: kit - файл модуля мимо index.ts',
        file: 'src/shell/layout/__probe.ts',
        target: '@/kit/__probe-kit/Widget',
        ruleId: 'boundaries/dependencies',
        text: 'через index.ts модуля',
    },
    {
        name: 'rule 4: внутри модуля kit - не свой index.ts',
        file: 'src/kit/__probe-kit/__probe.ts',
        target: '@/kit/__probe-kit',
        ruleId: 'boundaries/dependencies',
        text: 'не свой index.ts',
    },
    {
        name: 'экран импортирует не маршрутизатор',
        file: 'src/shell/layout/__probe.ts',
        target: '@/entities/__probe-a/table/ItemsPage',
        ruleId: 'boundaries/dependencies',
        text: 'imported only by the router',
    },
    {
        name: 'файл вне элементов',
        file: 'src/__probe-unknown/__probe.ts',
        target: '@/lib/utils',
        ruleId: 'boundaries/no-unknown-files',
        text: '',
    },
];

const allowed: Case[] = [
    {
        name: 'rule 2: ядро сущности берёт своё же ядро',
        file: 'src/entities/__probe-a/__probe.ts',
        target: '@/entities/__probe-a/types',
    },
    {
        name: 'rule 3: часть берёт ядро своей сущности',
        file: 'src/entities/__probe-a/table/__probe.ts',
        target: '@/entities/__probe-a/types',
    },
    {
        name: 'rule 3: часть берёт чужую сущность через index.ts',
        file: 'src/entities/__probe-b/profile/__probe.ts',
        target: '@/entities/__probe-a',
    },
    {
        name: 'маршрутизатор импортирует экран',
        file: 'src/app/__probe.ts',
        target: '@/entities/__probe-a/table/ItemsPage',
    },
    {
        name: 'kit - через index.ts модуля',
        file: 'src/shell/layout/__probe.ts',
        target: '@/kit/__probe-kit',
    },
];

describe('eslint.config boundaries', { timeout: 30_000 }, () => {
    let eslint: ESLint;

    const lint = async ({ file, target }: Case) => {
        const [result] = await eslint.lintText(`export * from '${target}';\n`, {
            filePath: `${cwd}/${file}`,
        });
        return result.messages;
    };

    beforeAll(() => {
        for (const file of FIXTURES) {
            const path = resolve(cwd, file);
            mkdirSync(dirname(path), { recursive: true });
            writeFileSync(path, 'export {};\n');
        }
        eslint = new ESLint({
            cwd,
            // Виртуальный файл вне tsconfig: projectService его отвергнет.
            overrideConfig: { languageOptions: { parserOptions: { projectService: false } } },
            ruleFilter: ({ ruleId }) => ruleId.startsWith('boundaries/'),
        });
    });

    afterAll(() => {
        for (const dir of FIXTURE_DIRS) rmSync(resolve(cwd, dir), { recursive: true, force: true });
    });

    it.each(violations)('падает: $name', async (probe) => {
        const messages = await lint(probe);
        expect(messages).toHaveLength(1);
        expect(messages[0].ruleId).toBe(probe.ruleId);
        expect(messages[0].message).toContain(probe.text);
    });

    it.each(allowed)('проходит: $name', async (probe) => {
        expect(await lint(probe)).toEqual([]);
    });
});
