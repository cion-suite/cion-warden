import { describe, expect, it } from 'vitest';

import { filterChangelog, isPrerelease, listChangelog } from '@/shell/update/changelog-filter';

const LOG = [
    '### Версия v1.2.0-beta.1',
    '',
    '- Бета-правка.',
    '',
    '---',
    '',
    '### Версия v1.1.0',
    '',
    '- Новое окно.',
    '- Быстрее старт.',
    '',
    '---',
    '',
    '### Версия v1.0.0',
    '',
    '- Первый релиз.',
    '',
].join('\n');

const V110 = '### Версия v1.1.0\n\n- Новое окно.\n- Быстрее старт.';
const V100 = '### Версия v1.0.0\n\n- Первый релиз.';
const V120B1 = '### Версия v1.2.0-beta.1\n\n- Бета-правка.';

describe('filterChangelog', () => {
    it('пустой файл -> пустая строка', () => {
        expect(filterChangelog('', '1.0.0', '1.1.0')).toBe('');
    });

    it('файл без заголовков версий -> пустая строка', () => {
        expect(filterChangelog('просто памятка\n- буллет', '1.0.0', '1.1.0')).toBe('');
    });

    it('одна версия: раздел без хвостового разделителя', () => {
        expect(filterChangelog(LOG, '1.0.0', '1.1.0')).toBe(V110);
    });

    it('диапазон (current, target]: нижняя граница исключена, порядок файла', () => {
        expect(filterChangelog(LOG, '0.9.0', '1.1.0')).toBe(`${V110}\n\n---\n\n${V100}`);
    });

    it('пререлиз входит в диапазон по semver', () => {
        expect(filterChangelog(LOG, '1.0.0', '1.2.0-beta.1')).toBe(`${V120B1}\n\n---\n\n${V110}`);
    });

    it('версия новее target не попадает', () => {
        expect(filterChangelog(LOG, '0.9.0', '1.0.0')).toBe(V100);
    });

    it('откат: только раздел target', () => {
        expect(filterChangelog(LOG, '1.1.0', '1.0.0')).toBe(V100);
    });

    it('та же версия трактуется как откат: раздел target', () => {
        expect(filterChangelog(LOG, '1.1.0', '1.1.0')).toBe(V110);
    });

    it('нет разделов в диапазоне -> пустая строка', () => {
        expect(filterChangelog(LOG, '1.1.0', '1.1.5')).toBe('');
    });

    it('битая версия аргумента -> пустая строка', () => {
        expect(filterChangelog(LOG, 'abc', '1.1.0')).toBe('');
        expect(filterChangelog(LOG, '1.0.0', '')).toBe('');
    });

    it('битый заголовок закрывает предыдущий раздел и сам не попадает', () => {
        const log = '### Версия v1.0.0\n\n- ok\n\n### Версия v01.0.0\n\n- x';

        expect(filterChangelog(log, '0.1.0', '1.0.0')).toBe('### Версия v1.0.0\n\n- ok');
    });

    it('текст до первого заголовка не входит ни в один раздел', () => {
        const log = 'памятка\n\n### Версия v1.0.0\n\n- ok';

        expect(filterChangelog(log, '0.1.0', '1.0.0')).toBe('### Версия v1.0.0\n\n- ok');
    });

    it('CRLF в файле не мешает разбору', () => {
        expect(filterChangelog(LOG.replace(/\n/g, '\r\n'), '1.0.0', '1.1.0')).toBe(V110);
    });

    it('BOM перед первым заголовком не скрывает раздел', () => {
        expect(filterChangelog(`\uFEFF${LOG}`, '1.1.0', '1.2.0-beta.1')).toBe(
            '### Версия v1.2.0-beta.1\n\n- Бета-правка.',
        );
    });

    it('текст после `---` до следующего заголовка не входит в раздел', () => {
        const log = '### Версия v1.1.0\n\n- A.\n\n---\n\nПримечание вне раздела\n\n---\n\n### Версия v1.0.0\n\n- B.\n';
        expect(filterChangelog(log, '1.0.0', '1.1.0')).toBe('### Версия v1.1.0\n\n- A.');
    });
});

describe('listChangelog', () => {
    it('скрывает версии новее текущей, тело без заголовка', () => {
        expect(listChangelog(LOG, '1.1.0')).toEqual([
            { version: '1.1.0', notes: '- Новое окно.\n- Быстрее старт.' },
            { version: '1.0.0', notes: '- Первый релиз.' },
        ]);
    });

    it('текущая версия - пререлиз: показывает всё до неё включительно', () => {
        expect(listChangelog(LOG, '1.2.0-beta.1').map((e) => e.version)).toEqual(['1.2.0-beta.1', '1.1.0', '1.0.0']);
    });

    it('пустой файл -> пустой список', () => {
        expect(listChangelog('', '1.0.0')).toEqual([]);
    });

    it('все версии новее текущей -> пустой список', () => {
        expect(listChangelog(LOG, '0.1.0')).toEqual([]);
    });

    it('раздел без тела -> пустые notes', () => {
        expect(listChangelog('### Версия v1.0.0', '1.0.0')).toEqual([{ version: '1.0.0', notes: '' }]);
    });

    it('битая текущая версия -> все разделы', () => {
        expect(listChangelog(LOG, 'dev')).toHaveLength(3);
    });
});

describe('isPrerelease', () => {
    it('суффикс -> бета, иначе релиз', () => {
        expect(isPrerelease('1.1.0-beta.0')).toBe(true);
        expect(isPrerelease('1.1.0')).toBe(false);
    });
});
