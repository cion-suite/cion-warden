import { describe, it, expect } from 'vitest';

import { resources } from '@/lib/i18n/resources';
import { SECTIONS, SIDEBAR_GROUPS } from '@/shell/sidebar/sections';

const hasKey = (tree: unknown, path: string): boolean =>
    typeof path
        .split('.')
        .reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], tree) === 'string';

describe('SECTIONS: таблица разделов', () => {
    it('пути уникальны и начинаются с "/"', () => {
        const paths = SECTIONS.map((section) => section.path);

        expect(new Set(paths).size).toBe(paths.length);
        expect(paths.every((path) => path.startsWith('/') && path.length > 1)).toBe(true);
    });

    it('каждому разделу есть заголовок в обеих локалях', () => {
        for (const { i18nKey } of SECTIONS) {
            expect(hasKey(resources.en.common, i18nKey), `en: ${i18nKey}`).toBe(true);
            expect(hasKey(resources.ru.common, i18nKey), `ru: ${i18nKey}`).toBe(true);
        }
    });

    it('"что нового" - раздел сайдбара /changelog', () => {
        expect(SECTIONS.find((section) => section.path === '/changelog')?.i18nKey).toBe('nav.changelog');
    });

    it('в каждой группе сайдбара есть раздел', () => {
        for (const group of ['local', 'sources', 'misc', 'footer'] as const) {
            expect(
                SECTIONS.some((section) => section.group === group),
                group,
            ).toBe(true);
        }
    });

    it('у групп с заголовком есть nav.section.<группа> в обеих локалях', () => {
        for (const group of SIDEBAR_GROUPS) {
            expect(hasKey(resources.en.common, `nav.section.${group}`), `en: ${group}`).toBe(true);
            expect(hasKey(resources.ru.common, `nav.section.${group}`), `ru: ${group}`).toBe(true);
        }
    });

    it('группа footer не входит в SIDEBAR_GROUPS: у неё нет заголовка', () => {
        expect(SIDEBAR_GROUPS).not.toContain('footer');
    });
});
