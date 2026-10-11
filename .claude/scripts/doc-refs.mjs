// Сверка ссылок в документации с реальным репозиторием. Read-only.
// node .claude/scripts/doc-refs.mjs [path-prefix]
// Пишет .claude/cache/sync-docs/report.md - только расхождения, каждое с подсказкой для правки.
// Механически объяснимое (fence, "файла нет", внешний репозиторий) не попадает в report.md:
// счётчик SUPPRESSED на stdout, построчно - в suppressed.md рядом.
// Также запрещает `путь:N` (номер строки уезжает молча);
// в .claude/agents/ сверяет frontmatter и глубину путей.
import path from 'node:path';
import { repo, cache, die } from './lib.mjs';

const scope = (process.argv[2] || '').replace(/\\/g, '/').replace(/^\.\//, '');
const out = cache.open('sync-docs');

const allFiles = repo.files();
const known = new Set(allFiles);
const pkg = JSON.parse(repo.read('package.json'));

// Имена из списка файлов git, не с диска: пустой каталог
// после переноса слайсом не считается
const under = (dir, re) => new Set(allFiles.filter(f => f.startsWith(dir + '/'))
    .map(f => f.slice(dir.length + 1).match(re)?.[1]).filter(Boolean));
const dirs = d => under(d, /^([^/]+)\//);
const mds = d => under(d, /^([^/]+)\.md$/);
// Путь - каталог с файлами или файл без расширения
// (`src/lib/utils`); `@/` - тот же `src/`
const exists = p => {
    const q = p.replace(/^@\//, 'src/');
    return allFiles.some(f => f.startsWith(q + '/') || f.startsWith(q + '.'));
};

// Док ссылается кратчайшим однозначным суффиксом: `paths.ts`
const bare = t => t.replace(/^(\.\.\.\/|\.\/|@)/, '');
const fileKnown = t => bare(t).startsWith('.claude/cache/') || repo.find(t).length > 0;

// Замена - файл с самым длинным общим хвостом пути.
// Хвост из одного имени берём, только если оно уникально
const nearest = t => {
    const segs = bare(t).split('/');
    for (let k = segs.length - 1; k >= 1; k--) {
        const tail = '/' + segs.slice(-k).join('/');
        const hits = allFiles.filter(f => ('/' + f).endsWith(tail));
        if (hits.length) return hits.length === 1 ? hits[0] : null;
    }
    return null;
};

// -- инвентарь репозитория

const { dirname, basename } = path.posix;
// Слайс - только сущность или модуль kit: перечень частей
// внутри сущности - ручная карта, отстающая от переносов
const slicesOf = d => [...dirs(d)].map(n => `${d}/${n}`);
// Имя слайса в тексте - путь от `src/`: `entities/user`
const short = t => t.slice('src/'.length);
// `kit/table` в `kit/table-extra` - не упоминание
const mention = t => new RegExp(`(?<![\\w./@-])(?:(?:src|@)/)?${short(t)}(?![\\w-])`);
const inv = {
    slice: new Set(['src/entities', 'src/kit'].flatMap(slicesOf)),
    agent: new Set([...mds('.claude/agents')].filter(n => n !== 'README')),
    command: mds('.claude/commands'),   // .claude/skills/** - вендорные, не проектные
    script: new Set(Object.keys(pkg.scripts || {})),
    dep: new Set([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})]),
};

// .claude/skills/** - вендорные: не сканируем.
// docs/planned-now.md - план, а не документ: его сверяет plan-scan
const DOCS = [
    'README.md', 'CLAUDE.md', 'CONTRIBUTING.md',
    ...allFiles.filter(f => /^docs\/[^/]+\.md$/.test(f) && f !== 'docs/planned-now.md'),
    ...allFiles.filter(f => /^\.claude\/(agents|commands)\/[^/]+\.md$/.test(f)),
].filter(f => known.has(f)).filter(f => !scope || f.startsWith(scope));
// иначе опечатка в scope дала бы "docs in sync" по нулю файлов
if (!DOCS.length) die(`scope \`${scope}\` не совпал ни с одним сканируемым доком`);

// -- правила извлечения

const PNPM_BUILTIN = new Set(['install', 'i', 'add', 'remove', 'why', 'dlx', 'exec', 'store', 'update', 'run', 'list', 'audit']);
const ALIAS = /^@(app|shared)\//;
const DEP = /(@[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9.-]*)/g;
// `@typescript-eslint/no-...` - правило ESLint, не пакет:
// префиксы плагинов берём из ключей правил конфига
const ESLINT_PLUGINS = new Set([...repo.read('eslint.config.js').matchAll(/['"](@[\w-]+)\/[\w-]+['"]\s*:/g)].map(m => m[1]));
// входы пакета - ключи exports: `/preload`
const entries = dep => Object.keys(JSON.parse(repo.read(`node_modules/${dep}/package.json`) || '{}').exports ?? {});

// расширения, по которым `текст` читается как ссылка на файл
const EXT = 'ts|tsx|js|mjs|md|json|css';
const fileRef = tail => new RegExp(`\`([\\w./@-]+\\.(?:${EXT})${tail})\``, 'g');
// номера строк за двоеточием: `:20`, `:20-21`, `:20-21,62`
const LINES = ':\\d+(?:-\\d+)?(?:,\\d+(?:-\\d+)?)*';

// Глубина `src/...` в профилях агентов - число сегментов с `src`
// и файлом: глубже папки части профиль копирует раскладку
const DEPTH = { entities: 4, kit: 3, shell: 3, ui: 3, lib: 3, app: 3 };
const withinDepth = t => {
    const segs = t.replace(/^@/, 'src').split('/');   // `@/` - тот же `src/`
    return segs.length <= (DEPTH[segs[1]] ?? Infinity);
};

// group - правило только для доков этой группы (groupOf)
const RULES = [
    // Слева не путь (`packages/core/...` - чужой репо), справа не
    // буква/дефис: иначе `useFoo.ts` обрывается на `src/lib/use`
    { kind: 'slice', re: /(?<![\w./@-])(?:src|@)(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)+(?![\w-])/g, ok: exists },
    // имена агентов из инвентаря, иначе новый - UNDOCUMENTED
    { kind: 'agent', re: new RegExp(`\\b(expert-[a-z-]+${[...inv.agent].map(n => '|' + n).join('')})\\b`, 'g'), pick: 1, ok: t => inv.agent.has(t) },
    // Глобальные скиллы скриптом не проверить:
    // помечаем `?`, вердикт за триажем
    { kind: 'command?', re: /(?:^|[\s(«"'[]|(?<![\w.])`)\/([a-z][a-z0-9-]{1,30})(?![\w/-])/g, pick: 1, ok: t => inv.command.has(t) || SKILLS.has(t) },
    { kind: 'script', re: /\b(?:pnpm|npm run|yarn)\s+([a-z][a-z0-9:-]*)/g, pick: 1, ok: t => inv.script.has(t) || PNPM_BUILTIN.has(t) },
    { kind: 'dep', re: DEP, pick: 1, ok: t => ALIAS.test(t) || inv.dep.has(t) || ESLINT_PLUGINS.has(t.split('/')[0]) },
    { kind: 'file', re: fileRef(''), pick: 1, ok: fileKnown },
    // любая `путь:N` - находка: правка файла сдвигает строку,
    // а сверить цитату со ссылкой нечем
    { kind: 'line', re: fileRef(LINES), pick: 1, ok: () => false },
    // Путь целиком: slice обрывается на заглавной букве.
    // Сегмент не кончается на `.`/`*`: конец фразы, `**...**`
    { kind: 'depth', group: 'agents', re: /(?<![\w./@-])(?:src|@)(?:\/[^\s`'"()[\],;:|«»/]*[^\s`'"()[\],;:|«»/.*])+/g, ok: withinDepth },
];

// Скиллы вне .claude/commands: вендорные и встроенные в CLI.
// Встроенные - списком (на диске их нет); дрейфует с CLI
const SKILLS = new Set([
    ...dirs('.claude/skills'),
    'simplify', 'code-review', 'security-review', 'init', 'run', 'loop', 'schedule',
    'design', 'dataviz', 'claude-api', 'update-config', 'keybindings-help',
    'fewer-permission-prompts', 'artifact-design', 'artifact-diagramming', 'artifact-capabilities',
]);

const EXTERNAL = [/^cion-suite\//];   // соседний репозиторий, линкуется снаружи - файлов тут нет

// \\b бесполезен на кириллице, граница слова - явным классом
const NEG_BEFORE = /(?:^|[^а-яёa-z])(без|не|нет|никаких|вместо)\s*$/i;
const NEG_AFTER = /^\s*(?:[-—]\s*)?(нет|отсутству|не\s)/i;

// причина механического отсева; null - спорная, нужен триаж
const mutedWhy = (m, ln) => {
    // дерево в fence - не пример, если слоя больше нет:
    // устаревшую раскладку надо показать
    const gone = m.kind === 'slice' && !exists(m.tok.split('/').slice(0, 2).join('/'));
    if (m.fence && !gone) return 'пример в fence';
    if (EXTERNAL.some(re => re.test(m.tok))) return 'внешний репозиторий';
    // вход пакета, названного в той же строке
    const pkgOf = m.kind === 'command?' && [...ln.matchAll(DEP)].map(d => d[1]).find(d => entries(d).includes('./' + m.tok));
    if (pkgOf) return `вход пакета ${pkgOf}`;
    const i = ln.indexOf(m.tok);
    const before = ln.slice(Math.max(0, i - 40), i).replace(/[`«"'([]+$/, '');
    const after = ln.slice(i + m.tok.length).replace(/^[`»"')\]]+/, '');
    // у depth проверяется сама запись пути в профиле:
    // "нет `src/.../X.ts`" её не оправдывает
    return m.kind !== 'depth' && (NEG_BEFORE.test(before) || NEG_AFTER.test(after)) ? 'текст утверждает отсутствие' : null;
};

const PLACEHOLDER = /[<>*…{}]|\.\.\.|-$/;
const groupOf = f => f.startsWith('.claude/agents/') ? 'agents' : f.startsWith('.claude/commands/') ? 'commands' : 'root';

// `a/{b,c}/` раскрывается в пути: иначе члены не сверяются.
// Голова - цельный путь, иначе `/model` сошёл бы за команду
const expand = ln => ln.replace(/(?<![\w@./<>-])([\w@.][\w@./-]*[/-])\{([\w., /-]+)\}/g,
    (_, head, list) => list.split(',').map(x => head + x.trim()).join(' '));

// Значение не простой скаляр YAML, если начинается с этого:
// `-`, `?`, `:` - индикаторы лишь перед пробелом
const YAML_LEAD = /^(?:[[\]{},#&*!|>'"%@`]|[-?:](?:\s|$))/;
const DESCRIPTION_MAX = 300;

// Ошибка во frontmatter - Claude Code молча не грузит агента.
// Регэксп, не js-yaml: из корня он не резолвится
const frontmatter = (f, lines) => {
    const hit = (line, tok, text) => ({ f, line, kind: 'frontmatter', tok, text });
    const close = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
    if (close < 0) return [hit(1, '---', 'нет блока frontmatter между `---`')];
    const fields = {};
    lines.slice(1, close).forEach((ln, i) => {
        const m = ln.match(/^([\w-]+):\s*(.*?)\s*$/);
        if (m) fields[m[1]] = { line: i + 2, value: m[2] };
    });
    const found = [];
    const bad = (key, text) => found.push(hit(fields[key]?.line ?? 1, key, text));
    const { name, description: d } = fields;
    if (name?.value !== basename(f, '.md')) bad('name', name ? `name \`${name.value}\` != имени файла` : 'нет поля name');
    if (!d) bad('description', 'нет поля description');
    else if (!d.value) bad('description', 'description пуст: значение - в той же строке, что и ключ');
    else if (YAML_LEAD.test(d.value)) bad('description', `description начинается с YAML-индикатора "${d.value[0]}"`);
    else if (/^\s+\S/.test(lines[d.line])) bad('description', 'description перенесён на следующую строку');
    else {
        if (/:(?:\s|$)/.test(d.value)) bad('description', 'description содержит `: `');
        if (/\s#/.test(d.value)) bad('description', 'description содержит ` #`');
        if (d.value.length > DESCRIPTION_MAX) bad('description', `description ${d.value.length} > ${DESCRIPTION_MAX}`);
    }
    return found;
};

const hits = [];
const quiet = [];
const dedup = new Set();
const seen = { slice: new Set(), agent: new Set(), command: new Set() };
const texts = new Map();
// собственный файл агента/команды упоминанием не считается
const own = (f, kind, t) => f === `.claude/${kind}s/${t}.md`;

for (const f of DOCS) {
    const text = repo.read(f);
    const lines = text.split(/\r?\n/);
    const group = groupOf(f);
    texts.set(f, lines.map(expand));
    // README.md каталога - не профиль: frontmatter у него нет
    if (group === 'agents' && !f.endsWith('/README.md')) hits.push(...frontmatter(f, lines));
    // засчитывается и короткое имя: `shell/navbar`
    for (const t of inv.slice) if (texts.get(f).some(ln => mention(t).test(ln))) seen.slice.add(t);
    for (const t of inv.command) if (text.includes(t) && !own(f, 'command', t)) seen.command.add(t);
    let fence = false;
    texts.get(f).forEach((ln, i) => {
        if (/^\s*```/.test(ln)) { fence = !fence; return; }
        for (const r of RULES) {
            if (r.group && r.group !== group) continue;
            r.re.lastIndex = 0;
            let m;
            while ((m = r.re.exec(ln))) {
                const tok = r.pick ? m[r.pick] : m[0];
                if (!tok || PLACEHOLDER.test(tok)) continue;
                const kind = r.kind.replace('?', '');
                if (!own(f, kind, tok)) seen[kind]?.add(tok);
                const key = `${f}:${i}:${r.kind}:${tok}`;
                if (!r.ok(tok) && !dedup.has(key)) {
                    dedup.add(key);
                    const hit = { f, line: i + 1, kind: r.kind, tok, fence, text: lines[i].trim().slice(0, 120) };
                    hit.why = mutedWhy(hit, ln);
                    (hit.why ? quiet : hits).push(hit);
                }
            }
        }
    });
}

// Слайс-двойник уступает находке файла: у неё есть подсказка.
// Сверка и с отсеянными, иначе он остался бы в MISSING
const files = Map.groupBy([...hits, ...quiet].filter(m => m.kind === 'file' || m.kind === 'line'), m => `${m.f}:${m.line}`);
const twin = m => m.kind === 'slice'
    && (files.get(`${m.f}:${m.line}`) ?? []).some(f => ['/', '.'].some(sep => f.tok.startsWith(m.tok + sep)));
const missing = hits.filter(m => !twin(m));
const muted = quiet.filter(m => !twin(m));

// Куда дописать неупомянутое: блок, где названо больше всего
// соседей. Меньше двух - дописывать некуда, это TODO
const siblingsBlock = names => {
    const forms = names.map(n => [n, ['`' + n + '`', '`/' + n + '`', '/' + n + '/', '/' + n + '`']]);
    let best = null;
    for (const [f, lines] of texts) {
        let start = -1, last = -1, found = new Set();
        lines.forEach((ln, i) => {
            const here = forms.filter(([, marks]) => marks.some(m => ln.includes(m)));
            if (!here.length) return;
            if (last < 0 || i - last > 2) { start = i; found = new Set(); }
            last = i;
            for (const [n] of here) found.add(n);
            if (!best || found.size > best.size) best = { f, from: start + 1, to: i + 1, size: found.size };
        });
    }
    if (!best || best.size < 2) return null;
    return best.from === best.to ? `${best.f}:${best.from}` : `${best.f}:${best.from}-${best.to}`;
};

const undocumented = scope ? [] : [
    // соседи слайса - слайсы того же слоя
    ...[...inv.slice].filter(t => !seen.slice.has(t)).map(t => (
        { kind: 'slice', tok: t, where: siblingsBlock([...inv.slice].filter(s => dirname(s) === dirname(t) && s !== t).map(short)) }
    )),
    ...[...inv.agent].filter(t => !seen.agent.has(t)).map(t => ({ kind: 'agent', tok: t, where: siblingsBlock([...inv.agent].filter(a => a !== t)) })),
    ...[...inv.command].filter(t => !seen.command.has(t)).map(t => ({ kind: 'command', tok: `/${t}`, where: siblingsBlock([...inv.command].filter(c => c !== t)) })),
];

// -- вывод

const clean = !missing.length && !undocumented.length;

const hint = m => {
    if (m.kind !== 'file' && m.kind !== 'line') return '';
    if (m.kind === 'line') return '  => номер строки уезжает молча - сошлись на символ или путь';
    const to = nearest(m.tok);
    return to ? `  => похоже: \`${to}\`` : '  => замены нет';
};

let body = `# doc-refs - расхождения\n\n> Скан: ${DOCS.length} файлов${scope ? `, scope \`${scope}\`` : ''}. MISSING - только спорное: механически объяснимое уже в SUPPRESSED.\n`;
body += `\n## MISSING - ссылка на несуществующее или нарушение контракта (${missing.length})\n\n`;
const missingRows = missing.map(m => `${m.f}:${m.line} [${m.kind}] \`${m.tok}\` - ${m.text}${hint(m)}`);
const undocRows = undocumented.map(u => `[${u.kind}] ${u.tok}  => ${u.where ? `соседи перечислены в ${u.where}` : 'списка соседей нет - TODO'}`);
body += missing.length ? missingRows.join('\n') : '_нет_';
body += `\n\n## UNDOCUMENTED - существует, нигде не упомянуто (${undocumented.length})\n\n`;
body += undocumented.length ? undocRows.join('\n') : '_нет_';

let report = null;
if (!clean) {
    report = out.write('report.md', body + '\n');
    // отдельным файлом: report.md грепают по префиксу пути
    if (muted.length) out.write('suppressed.md',
        `# doc-refs - отсеяно автоматически (${muted.length})\n\n`
        + muted.map(m => `${m.f}:${m.line} [${m.kind}] \`${m.tok}\` - ${m.why}`).join('\n') + '\n');
}

const byGroup = g => missing.filter(m => groupOf(m.f) === g).length;
console.log(`MISSING=${missing.length} (root=${byGroup('root')} agents=${byGroup('agents')} commands=${byGroup('commands')})  SUPPRESSED=${muted.length}  UNDOCUMENTED=${undocumented.length}  -> ${report ?? 'docs in sync, кэш не создан'}`);

// До PARENT находок триажит родитель, прямо по stdout
const PARENT = 15;
if (missing.length <= PARENT) {
    if (missingRows.length) console.log(`\nMISSING\n${missingRows.join('\n')}`);
    if (undocRows.length) console.log(`\nUNDOCUMENTED\n${undocRows.join('\n')}`);
}
