import * as semver from 'semver';

// Формат заголовка един с scripts/release-notes.mjs и /notes.
const HEADING_RE = /^### Версия v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)[ \t]*$/;
const SEPARATOR = '\n\n---\n\n';

type Section = { version: string; body: string };

function parseSections(markdown: string): Section[] {
    const sections: Array<{ version: string; lines: string[] }> = [];
    let current: { version: string; lines: string[] } | undefined;

    // BOM от правки в Windows-редакторе скрыл бы первый заголовок
    for (const line of markdown.replace(/^\uFEFF/, '').split(/\r?\n/)) {
        if (line.startsWith('### ')) {
            const match = HEADING_RE.exec(line);
            // Без semver.valid v01.0.0 роняет сравнение TypeError'ом;
            // битый заголовок закрывает раздел
            current = match && semver.valid(match[1]) ? { version: match[1], lines: [line] } : undefined;
            if (current) sections.push(current);
        } else if (line.trim() === '---') {
            // Раздел кончается на `---`: текст дальше не его
            current = undefined;
        } else {
            current?.lines.push(line);
        }
    }

    return sections.map(({ version, lines }) => ({ version, body: lines.join('\n').trim() }));
}

const join = (sections: readonly Section[]): string => sections.map((s) => s.body).join(SEPARATOR);

/** Разделы в (current, target]; откат - только target. */
export function filterChangelog(markdown: string, current: string, target: string): string {
    if (!semver.valid(current) || !semver.valid(target)) return '';

    const sections = parseSections(markdown);
    const isDowngrade = semver.lte(target, current);

    return join(
        isDowngrade
            ? sections.filter((s) => semver.eq(s.version, target))
            : sections.filter((s) => semver.gt(s.version, current) && semver.lte(s.version, target)),
    );
}

/** Версия с суффиксом (-beta.N) - бета-канал. */
export const isPrerelease = (version: string): boolean => version.includes('-');

type ChangelogEntry = { version: string; notes: string };

/** История до current включительно, notes без заголовка. */
export function listChangelog(markdown: string, current: string): ChangelogEntry[] {
    const sections = parseSections(markdown);
    const visible = semver.valid(current) ? sections.filter((s) => semver.lte(s.version, current)) : sections;

    return visible.map(({ version, body }) => ({
        version,
        notes: body.split('\n').slice(1).join('\n').trim(),
    }));
}
