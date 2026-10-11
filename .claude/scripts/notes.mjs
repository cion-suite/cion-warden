// Дайджест правок для changelog и запись раздела версии в docs/versions/release.md
// (буллеты по желанию под `#### Категория` из словаря CATEGORIES).
//   node .claude/scripts/notes.mjs collect [git-range]   - режим, версия, файл лога, коммиты, файлы по областям
//   node .claude/scripts/notes.mjs write [--replace]     - записать [USERS] из .claude/cache/notes/entry.txt
//   node .claude/scripts/notes.mjs --selftest            - самопроверка механики файла
// collect пишет .claude/cache/notes/{digest.md,meta.json,diff.patch[,top.patch]}; что читать модели - READ=diff|top|digest в stdout.
// Файл лога пишет только write. Раздел версии - итог относительно прошлой версии, не история
// правок: [USERS] записи - ВЕСЬ раздел целиком (collect кладёт текущие буллеты в section.txt),
// write заменяет им раздел и называет убранное. Раздел range-режима - только с --replace.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, die, git, repo, cache } from './lib.mjs';

const VERSIONS_DIR = 'docs/versions';
const [cmd, ...args] = process.argv.slice(2);

// -- дайджест

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// область -> тема, если ВСЕ файлы в одной области
const AREAS = [
    [/^\.claude\//, 'инструменты'],          // до docs: иначе .claude/**.md уедет в документацию
    [/^docs\/|\.md$/, 'документация'],
    [/(^|\/)package\.json$|^pnpm-lock/, 'зависимости'],
    [TEST_FILE, 'тесты'],
    [/^app\//, 'бэкенд'],
    [/^shared\//, 'контракты'],
    [/^src\/(app|shell|entities|kit|ui|lib)\//, 'UI'],
    [/electron-builder|tsconfig|vite|vitest|eslint|^scripts\/|^\.github\//, 'сборка'],
];
const areaOf = f => AREAS.find(([re]) => re.test(f))?.[1] ?? 'прочее';

const EXPORT = /^\s*export\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(?:function\*?|const|let|class|interface|type|enum)\s+([\w$]+)/;
const HEADING = /^(#{1,6}\s+\S.*)/;
const TITLE = /^(#\s+\S.*)/;
const TEST = /\b(?:it|test)(?:\.\w+)?\(\s*(['"`])(.+?)\1/;
const COMMENT = /^\s*(?:\/\/+|#|\/\*+|\*+)\s*(.*?)\s*(?:\*\/)?$/;
const TRAILER = /^[\w-]+-by:\s/i;
const BLAND = /^(import\b|try\b|param\b)/;

// текст интерфейса: кириллический литерал или JSX-текст
const UI_TEXT = /(['"`])([^'"`]*[А-яЁё][^'"`]*)\1|>([^<>{}]*[А-яЁё][^<>{}]*)</g;

const cut = (s, n) => s.length > n ? `${s.slice(0, n - 1)}...` : s;
const names = (lines, re) => lines.map(t => t.match(re)?.at(-1)).filter(Boolean);
const texts = lines => lines.filter(t => !COMMENT.test(t))
    .flatMap(t => [...t.matchAll(UI_TEXT)].map(m => (m[2] ?? m[3]).trim()));

// Имя по обе стороны диффа - правка (~), не новая/удалённая
const delta = (added, removed) => {
    const a = new Set(added), r = new Set(removed);
    return [...[...a].map(x => (r.has(x) ? '~' : '+') + x), ...[...r].filter(x => !a.has(x)).map(x => `-${x}`)];
};

// Шапка нового файла - его назначение; строка-путь
// (`// shared/config.ts`) ничего не говорит
const lead = (lines, file) => {
    for (const t of lines.slice(0, 8)) {
        if (!t.trim() || t.startsWith('#!')) continue;
        const s = t.match(COMMENT)?.[1];
        if (s == null) return '';
        if (s && !file.endsWith(s)) return cut(s, 110);
    }
    return '';
};

// Соседние строки комментария - одна мысль, не рвём на ` | `.
// Строка, которая есть и среди удалённых, только переехала
const comments = f => {
    const was = new Set(names(f.removed, COMMENT));
    const blocks = [];
    let next = 0;
    for (const { line, text } of f.added) {
        const s = text.match(COMMENT)?.[1];
        if (s == null || (s && was.has(s))) continue;
        if (line === next) blocks[blocks.length - 1] += ` ${s}`;
        else blocks.push(s);
        next = line + 1;
    }
    return blocks.map(b => b.replace(/\s+/g, ' ').trim()).filter(b => b.length > 3);
};

const record = (f, at) => {
    const out = [`${f.status} ${f.path} +${f.plus} -${f.minus}${at ? ` | diff.patch:${at}` : ''}`];
    const put = (label, items, n) => {
        if (items.length) out.push(`    ${label} ${items.slice(0, n).join(' | ')}${items.length > n ? ` (+${items.length - n})` : ''}`);
    };
    if (!at) return out;
    const add = f.added.map(a => a.text);
    if (repo.kind(f.path) === 'doc') {
        // у удалённого файла оглавление целиком "удалено":
        // говорит только заголовок первого уровня
        const heads = f.status === 'D' ? names(f.removed, TITLE).slice(0, 1).map(h => `-${h}`)
            : delta(names(add, HEADING), names(f.removed, HEADING));
        put('#', heads.map(h => cut(h, 60)), 6);
        return out;
    }
    // import / try / param у верха файла о правке молчат
    put('@', [...new Set(f.hunks.map(h => h.trim()).filter(h => h && !BLAND.test(h)))].map(h => cut(h, 60)), 5);
    put('exp', delta(names(add, EXPORT), names(f.removed, EXPORT)), 8);
    const test = TEST_FILE.test(f.path);
    // Правку внутри функции показывают WHY-комментарии и текст
    // для пользователя (у теста - it:), без Read патча
    put('//', (f.status === 'A' ? [lead(add, f.path)] : test ? [] : comments(f)).filter(Boolean).map(s => cut(s, 160)), 2);
    if (test) put('it:', names(add, TEST).map(t => cut(t, 70)), 4);
    // ~ - строка с обеих сторон диффа, она только переехала
    else put('"', delta(texts(add), texts(f.removed)).filter(s => !s.startsWith('~')).map(s => cut(s, 60)), 4);
    return out;
};

// Ревизии без `..` - концы диапазона (git log понял бы их
// как всю историю). --right-only: лог `A...B` симметричен
const commits = (revs, paths) => {
    const r = revs.filter(a => !a.startsWith('-'));
    if (!r.length) return [];
    const range = r.some(x => x.includes('..')) ? r : [`${r[0]}..${r[1] ?? 'HEAD'}`];
    return git.run('log', '--no-merges', '--right-only', '--format=%s%n%b%x00', ...range, '--', ...paths)
        .split('\0').map(c => c.trim()).filter(Boolean)
        .map(c => {
            const [subject, ...body] = c.split(/\r?\n/).map(l => l.trim()).filter(l => l && !TRAILER.test(l));
            return [`* ${subject}`, ...body.map(l => `  ${cut(l, 160)}`)].join('\n');
        });
};

const kb = s => `${Math.round(Buffer.byteLength(s) / 1024)}KB`;

// Конец диапазона: `A..B` -> B (пусто - HEAD), `A B` -> B;
// одна ревизия - до рабочего дерева
const endOf = revs => {
    const r = revs.filter(a => !a.startsWith('-'));
    const range = r.find(x => x.includes('..'));
    return range ? range.split(/\.{2,3}/)[1] || 'HEAD' : r[1];
};

function collect() {
    const out = cache.open('notes');
    const diff = git.diff(args);
    // docs/versions - выход самой команды, а не правка
    const files = diff.files.filter(f => !repo.under(f.path, VERSIONS_DIR));
    if (!files.length) {
        console.log(`EMPTY - в режиме ${diff.mode} изменений нет, кэш не создан`);
        return;
    }

    // шум (lock, changelog, бинарники) в патч не идёт.
    // Удалённый файл - только факт удаления, без сотен строк "-"
    const bodyOf = f => {
        const stop = f.status === 'D' ? f.patch.search(/^(---|Binary|@@)/m) : -1;
        const body = stop > 0 ? `${f.patch.slice(0, stop)}(файл удалён целиком: -${f.minus})\n` : f.patch;
        return body.endsWith('\n') ? body : `${body}\n`;
    };
    let line = 1, patch = '';
    const at = new Map();
    for (const f of files) {
        if (f.bin || repo.kind(f.path) === 'noise') continue;
        const body = bodyOf(f);
        const n = body.split('\n').length - 1;
        at.set(f, `${line}-${line + n - 1}`);
        line += n;
        patch += body;
    }

    // Малый патч читается целиком: дайджест теряет мелочи.
    // Крупное без тел коммитов - top.patch, у range - дайджест
    const SMALL = 40 * 1024, TOP = 60 * 1024, TOP_LINES = 150, TOP_MIN = 20;
    // top.patch: по убыванию правки, файл - до TOP_LINES строк,
    // правки мельче TOP_MIN дайджест описывает достаточно
    const bytes = s => Buffer.byteLength(s);
    const clip = f => {
        const ls = bodyOf(f).split('\n');
        return ls.length <= TOP_LINES ? bodyOf(f)
            : `${ls.slice(0, TOP_LINES).join('\n')}\n... обрезано: ещё ${ls.length - TOP_LINES} строк, целиком - diff.patch:${at.get(f)}\n`;
    };
    let top = '';
    if (bytes(patch) > SMALL && diff.mode === 'uncommitted') {
        const big = files.filter(f => at.has(f) && f.status !== 'D' && f.plus + f.minus >= TOP_MIN
            && repo.kind(f.path) === 'code' && !TEST_FILE.test(f.path))
            .sort((a, b) => b.plus + b.minus - (a.plus + a.minus));
        for (const f of big) {
            if (bytes(top) + bytes(clip(f)) > TOP) break;
            top += clip(f);
        }
    }
    const read = bytes(patch) <= SMALL ? 'diff' : top ? 'top' : 'digest';

    const areas = Map.groupBy(files, f => areaOf(f.path));
    const order = [...areas].sort((a, b) => b[1].length - a[1].length);
    const theme = areas.size === 1 ? order[0][0] : '(смешанные области, выбери сам)';
    // версия - на конце диапазона: запись о старом коммите
    // не должна получать версию рабочего дерева
    const end = diff.mode === 'range' ? endOf(diff.revs) : undefined;
    const version = JSON.parse(end ? git.run('show', `${end}:package.json`) : repo.read('package.json')).version;
    const sum = k => files.reduce((s, f) => s + f[k], 0);
    const log = diff.mode === 'range' ? commits(diff.revs, diff.paths) : [];

    // READ=diff: патч читается целиком - детали дублировали бы
    const detail = read !== 'diff';
    const digest = [
        '# notes - дайджест',
        '',
        `режим ${diff.mode} (${diff.spec}) | версия ${version} | файлов ${files.length} (+${sum('plus')} -${sum('minus')}) | тема: ${theme}`,
        `области: ${order.map(([a, list]) => `${a} ${list.length}`).join(', ')}`,
        ...detail ? ['легенда: @ контекст хунков | exp экспорт (+ добавлен, - удалён, ~ изменён) | // шапка нового файла, у изменённого - добавленные комментарии'
            + ' | " текст интерфейса и сообщений (+ добавлен, - удалён) | it: тесты | # заголовки .md'
            + ' | diff.patch:<от>-<до> - строки файла в diff.patch (Read offset=<от> limit=<до-от+1>); нет диапазона - шум, не в патче'] : [],
        ...log.length ? ['', `## Коммиты (${log.length}, новые сверху)`, '', ...log] : [],
        ...order.flatMap(([a, list]) => ['', `## ${a} (${list.length})`, '',
            ...list.flatMap(f => detail ? record(f, at.get(f)) : record(f, at.get(f)).slice(0, 1))]),
        '',
    ].join('\n');

    const file = channelFile(version);
    const lines = splitLines(repo.read(file));
    const found = findSection(lines, version);
    const section = found ? 'exists' : 'new';
    // Буллеты раздела: модель сводит их с новыми в один итоговый список
    const body = found ? entriesOf(lines.slice(found.start + 1, found.end)) : [];
    const current = body.filter(l => BULLET.test(l));

    out.write('digest.md', digest);
    // write сверяет запись с тем, что увидел collect: режим и версию
    // модель не передаёт, подменить их в entry.txt нельзя
    out.write('meta.json', JSON.stringify({ mode: diff.mode, version }));
    if (patch) out.write('diff.patch', patch);
    if (read === 'top') out.write('top.patch', top);
    if (current.length && diff.mode === 'uncommitted') out.write('section.txt', `${body.join('\n')}\n`);
    console.log(`MODE=${diff.mode} VERSION=${version} FILE=${file} SECTION=${section} BULLETS=${current.length} FILES=${files.length} THEME=${theme} READ=${read} `
        + `DIGEST=${kb(digest)} DIFF=${kb(patch)}${read === 'top' ? ` TOP=${kb(top)}` : ''} -> ${out.rel}/`);
}

// -- файл версий

// ЕДИНЫЙ формат заголовка раздела. Копии: scripts/release-notes.mjs (CI) и
// src/shell/update/changelog-filter.ts (renderer): из .claude/ CI и renderer
// импортировать не могут, менять только все три разом.
const VERSION_HEADING = /^### Версия v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)[ \t]*$/;
const SEPARATOR = '---';
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

// Версия с суффиксом (-beta.N) не выпускается: лог один - release.md
const channelFile = version => {
    if (version.includes('-')) refuse(`версия ${version} с суффиксом: выпускаются только стабильные версии`);
    return `${VERSIONS_DIR}/release.md`;
};

// BOM от правки в Windows-редакторе скрыл бы первый заголовок
const splitLines = text => text.replace(/^\uFEFF/, '').split(/\r?\n/);

// last - конец тела без хвостовых пустых строк: буллеты вставляются
// вплотную к последнему, а пустая строка перед `---` остаётся на месте
const findSection = (lines, version) => {
    const start = lines.findIndex(l => l.match(VERSION_HEADING)?.[1] === version);
    if (start < 0) return null;
    let end = start + 1;
    while (end < lines.length && lines[end].trim() !== SEPARATOR && !/^###\s/.test(lines[end])) end++;
    let last = end;
    while (last > start + 1 && !lines[last - 1].trim()) last--;
    return { start, end, last };
};

const BULLET = /^- \S.*$/;
const CATEGORY = /^#### \S.*$/;
const entriesOf = lines => lines.map(l => l.trim()).filter(l => BULLET.test(l) || CATEGORY.test(l));
const bulletsOf = lines => entriesOf(lines).filter(l => BULLET.test(l));

// Закрытый словарь категорий раздела; порядок каноничный, write сортирует сам.
// Новая категория - правкой словаря, описаний в .claude/commands/notes.md
// и списка в CLAUDE.md, раздел 9
const CATEGORIES = ['Важно знать', 'Скрипты и бинды', 'Библиотеки и источники', 'Обновления', 'Интерфейс', 'Прочее'];

// Плоский список - до FLAT_MAX буллетов (категории по желанию), больше - только с категориями
const FLAT_MAX = 5;

// [USERS] -> группы: категория (null - плоский список) и её буллеты
function groupEntries(users) {
    const groups = [];
    for (const line of users) {
        if (CATEGORY.test(line)) groups.push({ name: line.slice(5).trim(), bullets: [] });
        else {
            if (!groups.length) groups.push({ name: null, bullets: [] });
            groups.at(-1).bullets.push(line);
        }
    }
    return groups;
}

// Тело раздела: категории по словарю, буллеты без дублей. Плоский список -
// как есть, без подзаголовков
function layout(users) {
    const seen = new Set();
    const fresh = bullet => {
        if (seen.has(bullet)) return false;
        seen.add(bullet);
        return true;
    };
    const groups = groupEntries(users)
        .map(g => ({ ...g, bullets: g.bullets.filter(fresh) }))
        .filter(g => g.bullets.length)
        .sort((a, b) => CATEGORIES.indexOf(a.name) - CATEGORIES.indexOf(b.name));
    const lines = groups.flatMap((g, i) => g.name === null
        ? g.bullets
        : [...i ? [''] : [], `#### ${g.name}`, '', ...g.bullets]);
    return { lines, bullets: groups.flatMap(g => g.bullets) };
}

class Refusal extends Error {}
const refuse = msg => { throw new Refusal(msg); };

// text - текущее содержимое файла канала (может быть пустым), возврат - новое.
// Строки вне раздела версии не меняются ни в одном режиме.
function applyEntry({ text, version, users, mode, replace = false }) {
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = splitLines(text);
    const section = findSection(lines, version);
    if (replace && mode !== 'range') refuse('--replace только для range-режима: в uncommitted раздел и так заменяется записью целиком');

    const { lines: body, bullets } = layout(users);

    if (!section) {
        const first = lines.findIndex(l => l.trim());
        const head = [`### Версия v${version}`, '', ...body];
        const created = first < 0 ? [...head, ''] : [...head, '', SEPARATOR, '', ...lines.slice(first)];
        return { text: created.join(eol), action: 'created', added: bullets.length, kept: 0, removed: [] };
    }

    if (mode === 'range' && !replace) {
        refuse(`раздел "### Версия v${version}" уже есть - range-режим не дописывает в него. `
            + 'Перезаписать раздел целиком: `write --replace` (старый текст раздела будет потерян)');
    }

    // Раздел - итоговое состояние: запись заменяет его целиком.
    // Строки вне раздела не трогаем; убранное возвращаем - его видно в выводе
    const old = bulletsOf(lines.slice(section.start + 1, section.end));
    lines.splice(section.start + 1, section.last - section.start - 1, '', ...body);
    const kept = bullets.filter(b => old.includes(b)).length;
    return {
        text: lines.join(eol),
        action: mode === 'range' ? 'replaced' : 'rewritten',
        added: bullets.length - kept,
        kept,
        removed: old.filter(b => !bullets.includes(b)),
    };
}

// Клавиатурные символы: Unicode-пробелы и пунктуация (тире, ёлочки, многоточие),
// стрелки, математика, значки, dingbats и emoji. Кириллица проходит.
const NON_KEYBOARD = /[\u00A0\u00AB\u00BB\u2000-\u206F\u2190-\u2BFF\uFE0F\u{1F000}-\u{1FAFF}]/gu;

const nonKeyboard = text => [...new Set(text.match(NON_KEYBOARD))];

// entry.txt: `<версия> - <тема>`, `[USERS]` буллеты (по желанию под `#### Категория`
// из словаря), `[GIT]` буллеты. [GIT] в файл не идёт, только проверяется: это
// текст commit-сообщения
function parseEntry(raw) {
    const problems = [];
    const [first = '', ...rest] = splitLines(raw.trim());
    const head = first.match(/^(\S+) - (\S.*)$/);
    if (!head) problems.push('первая строка не в формате `<версия> - <тема>`');
    else if (!SEMVER.test(head[1])) problems.push(`версия "${head[1]}" не semver (без префикса v)`);

    const sections = { USERS: [], GIT: [] };
    const seen = new Set();
    let at = null;
    for (const line of rest.map(l => l.trimEnd())) {
        const tag = line.match(/^\[(USERS|GIT)\]$/)?.[1];
        if (tag) {
            if (seen.has(tag)) problems.push(`секция [${tag}] повторяется`);
            seen.add(tag);
            at = tag;
        } else if (!line.trim()) continue;
        else if (!at) problems.push(`строка вне секции: "${line}"`);
        else if (at === 'USERS' && CATEGORY.test(line)) sections.USERS.push(line.trim());
        else if (!BULLET.test(line)) {
            problems.push(`в [${at}] только однострочные буллеты "- текст"${at === 'USERS' ? ' и категории "#### Название"' : ''}: "${line}"`);
        } else sections[at].push(line.trim());
    }
    if (!sections.USERS.some(l => BULLET.test(l))) problems.push('нет буллетов в секции [USERS]');
    problems.push(...categoryProblems(groupEntries(sections.USERS)));
    const junk = nonKeyboard(raw);
    if (junk.length) {
        problems.push(`только клавиатурные символы (-> вместо стрелки, - вместо тире, " вместо ёлочек), найдено: ${junk.join(' ')}`);
    }
    return { problems, version: head?.[1], users: sections.USERS };
}

// Либо плоский список (до FLAT_MAX), либо все буллеты под категориями из словаря
function categoryProblems(groups) {
    const problems = [];
    const [only] = groups;
    if (groups.length === 1 && only.name === null && only.bullets.length > FLAT_MAX) {
        problems.push(`${only.bullets.length} буллетов плоским списком: от ${FLAT_MAX + 1} нужны категории "#### Название" (${CATEGORIES.join(', ')})`);
    }
    const named = groups.filter(g => g.name !== null);
    if (named.length && groups.some(g => g.name === null)) problems.push('в [USERS] есть буллеты до первой категории');
    const seen = new Set();
    const placed = new Map();
    for (const { name, bullets } of named) {
        if (!CATEGORIES.includes(name)) problems.push(`категория "${name}" не из словаря: ${CATEGORIES.join(', ')}`);
        if (seen.has(name)) problems.push(`категория "${name}" повторяется`);
        seen.add(name);
        if (!bullets.length) problems.push(`категория "${name}" без буллетов`);
        for (const bullet of bullets) {
            const first = placed.get(bullet);
            if (first !== undefined && first !== name) problems.push(`буллет в двух категориях ("${first}" и "${name}"): ${bullet}`);
            else placed.set(bullet, name);
        }
    }
    return problems;
}

function write() {
    const box = cache.open('notes', { keep: true });
    const entryRel = `${box.rel}/entry.txt`;
    const metaRel = `${box.rel}/meta.json`;
    if (!repo.exists(metaRel)) die(`нет ${metaRel} - сначала collect`);
    if (!repo.exists(entryRel)) die(`нет ${entryRel} - сначала запиши туда готовый блок`);
    const flags = args.filter(a => a.startsWith('--'));
    const unknown = flags.filter(f => f !== '--replace');
    if (unknown.length) die(`неизвестный флаг ${unknown.join(' ')}`);

    const meta = JSON.parse(repo.read(metaRel));
    const entry = parseEntry(repo.read(entryRel));
    const problems = [...entry.problems];
    if (entry.version && entry.version !== meta.version) {
        problems.push(`версия записи ${entry.version} не совпала с версией collect ${meta.version}`);
    }
    if (problems.length) die(problems.join('; '));

    const file = channelFile(meta.version);
    const before = repo.read(file);
    const result = applyEntry({ text: before, version: meta.version, users: entry.users, mode: meta.mode, replace: flags.includes('--replace') });
    if (result.text !== before) {
        const abs = path.join(ROOT, file);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, result.text, 'utf8');
    }
    console.log(`OK - ${file}: раздел v${meta.version} ${result.action}, добавлено ${result.added}, оставлено ${result.kept}, убрано ${result.removed.length}`);
    // Убранное - прямо в выводе: потерянный по ошибке буллет виден сразу
    for (const bullet of result.removed) console.log(`  убрано: ${bullet}`);
}

// -- самопроверка

function selftest() {
    let failed = 0;
    const check = (name, ok) => { if (!ok) { failed++; console.error(`FAIL ${name}`); } };
    const thrown = fn => { try { fn(); return null; } catch (e) { return e instanceof Refusal ? e.message : 'не Refusal'; } };
    const apply = o => applyEntry({ mode: 'uncommitted', ...o });

    const A = '- Добавлена А.';
    const B = '- Исправлена Б.';
    const C = '- Ускорена В.';
    const existing = `### Версия v1.0.0-beta.1\n\n${A}\n${B}\n\n---\n\n### Версия v1.0.0-beta.0\n\n- Старое.\n`;

    // пустой файл: раздел без `---` (под ним нечего отделять)
    for (const text of ['', '\n\n']) {
        const r = apply({ text, version: '1.0.0-beta.0', users: [A] });
        check('пустой файл', r.action === 'created' && r.text === `### Версия v1.0.0-beta.0\n\n${A}\n`);
    }

    // новый раздел сверху, `---` под ним, остальное байт в байт
    const created = apply({ text: existing, version: '1.0.0-beta.2', users: [C] });
    check('создание сверху', created.action === 'created'
        && created.text === `### Версия v1.0.0-beta.2\n\n${C}\n\n---\n\n${existing}`);

    // раздел - итог: запись заменяет его, убранное названо, чужие разделы целы
    const appended = apply({ text: existing, version: '1.0.0-beta.1', users: [A, C] });
    check('переписывание', appended.action === 'rewritten' && appended.added === 1 && appended.kept === 1
        && appended.removed.length === 1 && appended.removed[0] === B
        && appended.text === existing.replace(`${B}\n`, `${C}\n`));
    check('чужой раздел цел', splitLines(appended.text).slice(-4, -1).join('\n') === '### Версия v1.0.0-beta.0\n\n- Старое.');
    // противоречие: функция добавлена и убрана в одной версии - уходит из раздела
    const gone = apply({ text: existing, version: '1.0.0-beta.1', users: [A] });
    check('убранное из раздела', gone.removed.length === 1 && !gone.text.includes(B) && gone.text.includes(A));

    // тот же список: файл не меняется
    const dup = apply({ text: existing, version: '1.0.0-beta.1', users: [A, B] });
    check('тот же список', dup.added === 0 && dup.kept === 2 && dup.removed.length === 0 && dup.text === existing);
    const mixed = apply({ text: existing, version: '1.0.0-beta.1', users: [A, C, C] });
    check('дубль внутри записи', mixed.added === 1 && mixed.kept === 1 && mixed.text.split(C).length === 2);
    // тот же буллет в другом разделе дублем не считается
    check('дубль между версиями допустим', apply({ text: existing, version: '1.0.0-beta.0', users: [A] }).added === 1);

    check('раздел без тела', apply({ text: '### Версия v1.0.0\n\n---\n', version: '1.0.0', users: [A] }).text
        === `### Версия v1.0.0\n\n${A}\n\n---\n`);
    check('голый заголовок', apply({ text: '### Версия v1.0.0', version: '1.0.0', users: [A] }).text
        === `### Версия v1.0.0\n\n${A}`);

    const crlf = apply({ text: existing.replaceAll('\n', '\r\n'), version: '1.0.0-beta.1', users: [C] });
    const bom = apply({ text: `\uFEFF${existing}`, version: '1.0.0-beta.1', users: [C] });
    const rewritten = apply({ text: existing, version: '1.0.0-beta.1', users: [C] });
    check('BOM', bom.action === 'rewritten' && bom.text === rewritten.text);

    check('CRLF', crlf.text.includes(`${C}\r\n`) && !/[^\r]\n/.test(crlf.text));

    check('канал release', channelFile('2.1.0') === 'docs/versions/release.md');
    check('суффикс - отказ', ['2.1.0-beta.3', '2.1.0-alpha.1'].every(v => thrown(() => channelFile(v))?.includes('суффикс')));

    // range: новый раздел создаётся, существующий - отказ, с --replace - только он
    check('range создаёт', apply({ text: existing, version: '1.0.0', users: [C], mode: 'range' }).action === 'created');
    const refused = thrown(() => apply({ text: existing, version: '1.0.0-beta.1', users: [C], mode: 'range' }));
    check('range отказ', refused?.includes('--replace'));
    const replaced = apply({ text: existing, version: '1.0.0-beta.1', users: [C], mode: 'range', replace: true });
    check('range --replace', replaced.action === 'replaced'
        && replaced.text === `### Версия v1.0.0-beta.1\n\n${C}\n\n---\n\n### Версия v1.0.0-beta.0\n\n- Старое.\n`);
    check('--replace вне range', thrown(() => apply({ text: existing, version: '1.0.0-beta.1', users: [C], replace: true })) !== null);

    // категории: словарь, порядок и плоский список
    const cats = apply({ text: '', version: '1.0.0', users: ['#### Интерфейс', A, '#### Важно знать', C] });
    check('категории в порядке словаря', cats.text === `### Версия v1.0.0\n\n#### Важно знать\n\n${C}\n\n#### Интерфейс\n\n${A}\n`);
    const flat = apply({ text: '', version: '1.0.0', users: [A, B] });
    check('плоский без подзаголовков', flat.text === `### Версия v1.0.0\n\n${A}\n${B}\n`);
    const regrouped = apply({ text: cats.text, version: '1.0.0', users: ['#### Обновления', A, B] });
    check('перекладка категорий', regrouped.kept === 1 && regrouped.added === 1 && regrouped.removed[0] === C
        && !regrouped.text.includes('#### Важно знать') && regrouped.text.includes('#### Обновления'));
    const twice = apply({ text: '', version: '1.0.0', users: ['#### Интерфейс', A, '#### Прочее', A, B] });
    check('дубль между категориями: остаётся в первой', twice.added === 2
        && twice.text === `### Версия v1.0.0\n\n#### Интерфейс\n\n${A}\n\n#### Прочее\n\n${B}\n`);
    check('entries: категории и буллеты', entriesOf(splitLines(cats.text)).join('|') === ['#### Важно знать', C, '#### Интерфейс', A].join('|'));

    // заголовок: версия целиком, не префикс
    check('заголовок', VERSION_HEADING.test('### Версия v1.2.3') && VERSION_HEADING.test('### Версия v1.2.3-beta.10')
        && !VERSION_HEADING.test('### Версия 1.2.3') && !VERSION_HEADING.test('### Версия v1.2'));
    check('версия-префикс', findSection(splitLines('### Версия v1.0.0-beta.1\n- x\n'), '1.0.0') === null);

    // entry: формат, секции, ASCII
    const entry = (users, git = '- Git.') => `1.0.0 - UI\n\n[USERS]\n${users}\n\n[GIT]\n${git}\n`;
    check('entry ok', parseEntry(entry(A)).problems.length === 0);
    check('entry users', parseEntry(entry(`${A}\n${B}`)).users.length === 2);
    for (const bad of ['- Готово \u2705', '- Тест \u2014 тест', '- Тест \u2192 тест', '- \u00ABЁлочки\u00BB', '- Тест\u2026']) {
        check(`entry ascii ${bad}`, parseEntry(entry(bad)).problems.some(p => p.includes('клавиатурные')));
    }
    check('entry ascii в [GIT]', parseEntry(entry(A, '- Тест \u2192')).problems.length > 0);
    check('entry без USERS', parseEntry('1.0.0 - UI\n\n[GIT]\n- Git.\n').problems.length > 0);
    check('entry не буллет', parseEntry(entry('Просто текст.')).problems.length > 0);
    check('entry версия', parseEntry(`v1.0.0 - UI\n\n[USERS]\n${A}\n`).problems.length > 0);
    const withCats = (...u) => parseEntry(entry(u.join('\n')));
    check('entry категории ок', withCats('#### Важно знать', A, '#### Интерфейс', B).problems.length === 0);
    check('entry неизвестная категория', withCats('#### Новости', A).problems.some(p => p.includes('словаря')));
    check('entry буллет до категории', withCats(A, '#### Интерфейс', B).problems.some(p => p.includes('до первой')));
    check('entry пустая категория', withCats('#### Интерфейс', '#### Прочее', A).problems.some(p => p.includes('без буллетов')));
    const bullets = n => Array.from({ length: n }, (_, i) => `- Пункт ${i + 1}.`);
    check('entry плоский до порога ок', parseEntry(entry(bullets(5).join('\n'))).problems.length === 0);
    check('entry плоский сверх порога - отказ', parseEntry(entry(bullets(6).join('\n'))).problems.some(p => p.includes('нужны категории')));
    check('entry сверх порога с категориями ок', parseEntry(entry(['#### Интерфейс', ...bullets(6)].join('\n'))).problems.length === 0);
    check('entry малый раздел с категорией допустим', withCats('#### Интерфейс', A).problems.length === 0);
    check('entry буллет в двух категориях', withCats('#### Интерфейс', A, '#### Прочее', A, B).problems.some(p => p.includes('в двух категориях')));
    check('entry повтор категории', withCats('#### Интерфейс', A, '#### Интерфейс', B).problems.some(p => p.includes('повторяется')));
    check('entry только категории', withCats('#### Интерфейс').problems.some(p => p.includes('нет буллетов')));
    check('entry категория в GIT нельзя', parseEntry(entry(A, '#### Интерфейс\n- Git.')).problems.length > 0);
    check('entry без GIT допустим', parseEntry(`1.0.0 - UI\n\n[USERS]\n${A}\n`).problems.length === 0);

    if (failed) { console.error(`selftest: упало ${failed}`); return 1; }
    console.log('selftest: OK');
    return 0;
}

if (cmd === '--selftest') process.exit(selftest());
const run = { collect, write }[cmd];
if (!run) die('использование: notes.mjs collect [git-range] | notes.mjs write [--replace] | notes.mjs --selftest');
try {
    run();
} catch (e) {
    if (e instanceof Refusal) die(e.message);
    throw e;
}
