// Сверка плана с кодом: ссылки file:line, нарушения в файлах плана, правила по пути новых файлов. Read-only.
// node .claude/scripts/plan-scan.mjs [plan-file]   (по умолчанию docs/planned-now.md)
// node .claude/scripts/plan-scan.mjs --selftest    (самопроверка извлечения путей плана)
// stdout - итоги, маршрут V/G и всё, что разбирает родитель. Срезы агентам - .claude/cache/isplan/{v1.md...,g.md},
// полный отчёт - report.md. Без плана кеш не создаётся.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, die, repo, cache } from './lib.mjs';
import { scan, matchPath } from './rules.mjs';

// -- новые пути плана

// Формы: `путь` (create ...) и `старый` -> `новый` (стрелка ASCII или юникодная).
// Только полные пути со "/"; `<e>` - шаблон, не совпадёт
const PLAN_PATH = String.raw`([\w.@-]+(?:/[\w.@-]+)+)`;
const CREATE = new RegExp(String.raw`\`${PLAN_PATH}\`\s*\(create`, 'g');
const MOVE = new RegExp(String.raw`\`${PLAN_PATH}\`\s*(?:->|→)\s*\`${PLAN_PATH}\``, 'g');

const newPaths = lines => {
    const found = new Map();
    lines.forEach((ln, i) => {
        const add = (file, from) => found.set(`${i}\0${file}`, { planLine: i + 1, file, ...(from && { from }) });
        for (const m of ln.matchAll(CREATE)) add(m[1]);
        for (const m of ln.matchAll(MOVE)) add(m[2], m[1]);
    });
    return [...found.values()];
};

// Файл, уже лежащий в репозитории, план не вносит; matchPath
// молчит, если старый путь нарушал то же (как в diff-scan)
const pathFindings = (lines, tracked) => newPaths(lines).filter(p => !tracked.has(p.file))
    .flatMap(p => matchPath(p.file, p.from).map(r => ({ ...p, ...r })));

// [строка плана, ожидаемые правила, пути уже в репозитории]
const PATH_CASES = [
    ['`src/entities/item/ui/ItemCard.tsx` (create)', ['3.16']],
    ['`src/entities/item/ItemCard.tsx` (create)', []],
    ['`src/entities/u/ui/X.tsx` -> `src/entities/u/model/X.tsx`', []],
    ['`src/ui/shadcn/copy-button.tsx` -> `src/ui/copy-button.tsx`', ['3.17']],
    ['`src/ui/shadcn/copy-button.tsx` → `src/ui/copy-button.tsx`', ['3.17']],
    ['`src/entities/item/ui/ItemCard.tsx` (modify)', []],
    ['`src/entities/<e>/ui/X.tsx` (create)', []],
    ['`use-x.ts` (create)', []],
    ['`src/entities/item/ui/ItemCard.tsx` (create)', [], ['src/entities/item/ui/ItemCard.tsx']],
];

const selftest = () => {
    let bad = 0;
    for (const [line, expected, tracked = []] of PATH_CASES) {
        const got = pathFindings([line], new Set(tracked)).map(r => r.id).sort().join();
        if (got !== expected.join()) { console.error(`FAIL: ${line} - ожидалось [${expected}], получено [${got}]`); bad++; }
    }
    console.log(bad ? `SELFTEST: ${bad} провалов` : `SELFTEST: ok, ${PATH_CASES.length} случаев путей плана`);
    return bad ? 1 : 0;
};

// До cache.open: самопроверка кеш не трогает
if (process.argv.includes('--selftest')) process.exit(selftest());

const planFile = path.relative(ROOT, path.resolve(ROOT, process.argv[2] || 'docs/planned-now.md')).replace(/\\/g, '/');
const out = cache.open('isplan');
// EMPTY = зелёный и стоп - только для плана по умолчанию:
// пустой/отсутствующий; вне репозитория и опечатка - отказ
if (planFile.startsWith('../') || path.isAbsolute(planFile)) die(`${planFile} вне репозитория - положи план в репозиторий`);
if (process.argv[2] && !repo.exists(planFile)) die(`${planFile} не найден`);
const plan = repo.read(planFile);
if (!plan.trim()) {
    console.log(`EMPTY - ${planFile} пуст или отсутствует, кеш не создан`);
    process.exit(0);
}
const planLines = plan.split(/\r?\n/);

// -- файлы репозитория

const FILES = repo.files();
const TRACKED = new Set(FILES);
const base = f => f.slice(f.lastIndexOf('/') + 1);
// каталоги любой глубины: `user/model/x.ts` - суффикс пути
// репозитория, а не чужой пакет
const DIRS = new Set(FILES.flatMap(f => f.split('/').slice(0, -1)));
const TOP = new Set(FILES.filter(f => f.includes('/')).map(f => f.split('/')[0]));

const cached = new Map();
const linesOf = f => cached.get(f) ?? cached.set(f, repo.lines(f)).get(f);
const lengthOf = f => repo.count(linesOf(f));

// План ссылается суффиксом пути или алиасом (`@/`, `@app/`)
const bare = tok => tok.replace(/^@\//, 'src/').replace(/^(\.\.\.\/|\.\/|@)/, '');
// `suite/...` - корень cion-suite: ядро подключено link:'ом,
// монорепо - два уровня над его реальным путём
const SUITE = (() => {
    try { return path.relative(ROOT, path.resolve(fs.realpathSync(path.join(ROOT, 'node_modules/@cion-suite/core')), '../..')).replace(/\\/g, '/'); }
    catch { return null; }
})();
const find = tok => {
    if (SUITE && tok.startsWith('suite/')) {
        const cand = `${SUITE}/${tok.slice('suite/'.length)}`;
        return repo.exists(cand) ? [cand] : [];
    }
    const hits = repo.find(tok);
    if (hits.length) return hits;
    const s = bare(tok);
    // Исходники зависимостей (@cion-suite/core) git не видит,
    // а план их цитирует; без `@` - bare() срезает scope пакета
    for (const cand of [tok, `node_modules/${tok}`, `node_modules/${s}`])
        if (cand.includes('/') && repo.exists(cand)) return [cand];
    return [];
};

// -- ссылки и цитаты плана

// `a.ts:44,56-62` - список отрезков, не диапазон 44...56
const REF = /([\w./@-]+\.(?:ts|tsx|js|mjs|cjs|md|json|css|ya?ml)):(\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*)/g;
// `a.ts:97 ..., :110` - номер без файла продолжает файл слева.
// Не продолжение: `:` вплотную к букве, цифре, `/`, `]`
const TAIL = /(?<![\p{L}\p{N}_./:\])]):(\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*)(?![\p{L}\p{N}_:]|\.\d)/gu;
// Файл без координаты тоже голова продолжения: `:25` после
// `docs/b.md` - о b.md; голое имя в прозе - мимоходом
const NAMED = /`([\w./@-]+\.(?:ts|tsx|js|mjs|cjs|md|json|css|ya?ml))`/g;
const QUOTE = /`([^`\n]{3,120})`/g;
// план цитирует приблизительно; шире - подтвердит что попало
const WINDOW = 3;

const COMMON = new Set(('return const let var async await catch error err try throw new null undefined true false this ' +
    'function import export from type interface string number boolean void default else for while case break ' +
    'continue class extends typeof instanceof value data result item items includes push map filter then ' +
    'get set has join split slice length find keys entries forEach reduce console log').split(' '));

// Цитата годится, если совпасть случайно ей трудно:
// `catch`, `return null` есть у любой строки, `isFired` - нет
const usable = q => {
    if (/^[\w@./-]+$/.test(q) && q.includes('/')) return false;     // путь, а не код
    if (!/[^\w]/.test(q) && q.length < 8 && !(/[a-z][A-Z]|_/.test(q) && q.length >= 5)) return false;
    const rare = Math.max(0, ...(q.match(/[A-Za-zА-Яа-яЁё_$][\wА-Яа-яЁё$]*/g) ?? []).filter(w => !COMMON.has(w)).map(w => w.length));
    return rare >= 4 || q.length >= 12 && rare >= 3;
};

const norm = s => s.replace(/\s+/g, ' ').trim();

// `a.ts:21 WHERE x = ?` - код у ссылки и есть цитата.
// `fn()` - имя, не вызов; после `...` берём длиннейший кусок
const evidence = q => q.replace(REF, '').split(/\.{3}|…/)
    .map(p => norm(p).replace(/(\w{5,})\(\)$/, '$1('))
    .filter(usable)
    .sort((a, b) => b.length - a.length)[0];

const refs = [];
planLines.forEach((ln, i) => {
    const found = [...ln.matchAll(REF)];
    const paths = [...ln.matchAll(NAMED)].filter(m => m[1].includes('/') || TRACKED.has(m[1]));
    const heads = [...found, ...paths].sort((a, b) => a.index - b.index);
    if (!heads.length) return;
    const parts = [
        ...found.map(m => ({ at: m.index, tok: m[1], nums: m[2] })),
        ...[...ln.matchAll(TAIL)].flatMap(m => {
            const head = heads.findLast(f => f.index < m.index);
            return head ? [{ at: m.index, tok: head[1], nums: m[1], tail: true }] : [];
        }),
    ].sort((a, b) => a.at - b.at);
    const quotes = [...new Set([...ln.matchAll(QUOTE)].map(q => evidence(q[1])).filter(Boolean))]
        .sort((a, b) => b.length - a.length);
    for (const p of parts) {
        refs.push({ planLine: i + 1, at: p.at, tok: p.tok, spec: `${p.tok}:${p.nums}`, spans: repo.spans(p.nums), quotes, single: found.length === 1, tail: p.tail });
    }
});

// Годная цитата плана у отрезка ссылки: даже чужая
// у ЭТОЙ строки кода доказывает, что ссылка стоит на коде
const quoted = (f, r) => {
    const lines = linesOf(f);
    return r.quotes.find(q => r.spans.some(([a, b]) => norm(lines.slice(Math.max(0, a - 1 - WINDOW), b + WINDOW).join('\n')).includes(q)));
};

// -- вердикт по ссылкам

// Доказуемо только совпадение: фраза плана несёт несколько
// утверждений; нет цитаты у строки != доказанная ошибка
const verdict = { INVALID: [], CHECK: [], OK: [], EXTERNAL: [] };

// features/widgets/pages - слои src/ до миграции: не чужой пакет,
// а путь репозитория, который надо показать
const FORMER = new Set(['features', 'widgets', 'pages']);
const outside = tok => tok.includes('/') && ![DIRS, FORMER].some(names => names.has(bare(tok).split('/')[0]));
// Голое имя чужое, только если план дал ему внешний путь;
// иначе это опечатка в имени файла репозитория
const externalNames = new Set(refs.filter(r => outside(r.tok) && !find(r.tok).length).map(r => base(r.tok)));

const alike = tok => {
    const stem = base(tok).split('.')[0];
    return FILES.filter(f => base(f).split('.')[0] === stem).slice(0, 3);
};

// Код у начала первых трёх отрезков +-1: агенту V не нужно
// открывать файл. Пустые соседние строки пропускаются
const around = (f, spans) => {
    const lines = linesOf(f);
    const heads = spans.slice(0, 3).map(([a]) => a);
    return [...new Set(heads.flatMap(a => [a - 1, a, a + 1]))]
        .filter(k => k >= 1 && k <= lengthOf(f) && (heads.includes(k) || lines[k - 1].trim()))
        .sort((a, b) => a - b).map(k => [k, lines[k - 1]]);
};

for (const r of refs) {
    let hits = find(r.tok);
    if (!hits.length) {
        if (outside(r.tok) || !r.tok.includes('/') && externalNames.has(r.tok)) verdict.EXTERNAL.push(r);
        // `src/shell/new.ts` (create) ... `:5` - путь будущий, номер,
        // скорее всего, о файле до переноса
        else if (r.tail) verdict.CHECK.push({ ...r, why: 'файла нет в репозитории - номер без имени файла у пути, которого ещё нет (create / перенос?)' });
        else if (TOP.has(r.tok.split('/')[0])) verdict.INVALID.push({ ...r, why: 'файла нет в репозитории' });
        else {
            const like = alike(r.tok);
            verdict.CHECK.push({ ...r, why: `файла нет в репозитории${like.length ? `; похожие: ${like.join(', ')}` : ''}` });
        }
        continue;
    }
    if (hits.length > 1) {
        const matched = hits.filter(f => quoted(f, r));
        if (matched.length !== 1) {
            // голый `index.ts` - сотни кандидатов: хватит примеров и числа
            const cands = matched.length ? matched : hits;
            verdict.CHECK.push({ ...r, why: `неоднозначно: ${cands.slice(0, 5).join(', ')}${cands.length > 5 ? ` и ещё ${cands.length - 5}` : ''}` });
            continue;
        }
        hits = matched;
    }
    const file = hits[0];
    const beyond = r.spans.map(([a]) => a).find(a => a > lengthOf(file));
    // Продолжение приклеено догадкой: `a.ts:12` + `:43` может быть
    // строкой теста, а не опечаткой
    if (beyond && r.tail) { verdict.CHECK.push({ ...r, file, why: `строка ${beyond} за пределами файла (${lengthOf(file)} строк) - номер без имени файла, возможно, о другом файле` }); continue; }
    if (beyond) { verdict.INVALID.push({ ...r, file, why: `строка ${beyond} за пределами файла (${lengthOf(file)} строк)` }); continue; }

    const q = quoted(file, r);
    if (q) { verdict.OK.push({ ...r, file, q }); continue; }

    // Дрейф - только при одном файле на строке: иначе цитата
    // может быть чужой. Продолжения подсказку не повторяют
    const lines = linesOf(file);
    const drift = r.single && !r.tail && r.quotes
        .map(q => ({ q, at: lines.flatMap((l, i) => norm(l).includes(q) ? [i + 1] : []) }))
        .find(d => d.at.length);
    verdict.CHECK.push({ ...r, file, code: around(file, r.spans), why: drift ? `подсказка: \`${drift.q}\` в файле на ${drift.at.slice(0, 3).join(', ')}` : '' });
}

// -- нарушения в файлах плана, не упомянутые планом

// Файл из "Where" план называет путём без координаты - иначе
// нарушения в главных файлах плана не видны
const named = [...plan.matchAll(/`([\w.@-]+(?:\/[\w.@-]+)+)`/g)].map(m => m[1]);
const scope = [...new Set([...verdict.OK, ...verdict.CHECK, ...verdict.INVALID].map(r => r.file).concat(named).filter(f => TRACKED.has(f)))];
// "Упомянул" = план назвал строку явно, в том числе в списке
// `:15,16,49`; диапазон `:139-193` и проза - не в счёт
const mentioned = g => plan.includes(`${base(g.file)}:${g.line}`) ||
    refs.some(r => r.spans.some(s => s.includes(g.line)) && find(r.tok).includes(g.file));
const gaps = scope.flatMap(f => scan(linesOf(f), f)).filter(g => !mentioned(g));

const paths = pathFindings(planLines, TRACKED);

const gapsC = gaps.filter(g => g.tier === 'C' && g.sev === '🔴');
const gapsK = gaps.filter(g => g.tier === 'K' && g.sev === '🔴');
// Жёлтые любого tier - старый долг (давний текст не правим), справка
const gapsY = gaps.filter(g => g.sev === '🟡');

// Одинаковые строки правила в файле - одно решение триажа
const triage = [...Map.groupBy(gapsK, g => `${g.file}\0${g.id}\0${g.text.trim()}`).values()]
    .map(list => ({ ...list[0], lines: list.map(g => g.line) }));

// -- маршрут

const groups = [...Map.groupBy(verdict.CHECK, r => r.planLine)].map(([planLine, items]) => ({ planLine, items }));
const agents = verdict.CHECK.length <= 12 ? 0 : verdict.CHECK.length <= 60 ? 1 : Math.min(3, Math.ceil(verdict.CHECK.length / 60));
const G = triage.length <= 8 ? 'parent' : 1;

// Срезы по строкам плана, поровну по ссылкам:
// группа строки не рвётся между агентами
const slices = [];
let acc = 0;
for (const g of agents ? groups : []) {
    if (!slices.length || slices.length < agents && acc >= verdict.CHECK.length * slices.length / agents) slices.push([]);
    slices.at(-1).push(g);
    acc += g.items.length;
}
// V - число реальных срезов: крупные строки плана могут не
// дать разрезать на столько агентов
const V = slices.length || 'parent';

// -- вывод

const clip = (s, n) => s.length > n ? s.slice(0, n - 1) + '...' : s;

// Выдержка строки плана вокруг каждой ссылки группы:
// утверждение стоит рядом со ссылкой
const excerpt = g => {
    const ln = planLines[g.planLine - 1];
    if (ln.length <= 260) return ln.trim();
    const cuts = g.items.map(r => [Math.max(0, r.at - 110), Math.min(ln.length, r.at + r.spec.length + 110)]).sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const c of cuts) {
        if (merged.length && c[0] <= merged.at(-1)[1]) merged.at(-1)[1] = Math.max(merged.at(-1)[1], c[1]);
        else merged.push(c);
    }
    return merged.map(([a, b]) => `${a ? '...' : ''}${ln.slice(a, b).trim()}${b < ln.length ? '...' : ''}`).join(' ');
};

const chkGroup = g => [
    `### план:${g.planLine}`,
    `> ${excerpt(g)}`,
    ...g.items.flatMap(r => [
        `- \`${r.spec}\`${r.file ? ` -> ${r.file}` : ''}${r.why ? ` - ${r.why}` : ''}`,
        ...(r.code ?? []).map(([k, t]) => `    ${k}| ${clip(t.trim(), 140)}`),
    ]),
].join('\n');

const ref = r => `план:${r.planLine} -> ${r.file ?? r.tok}:${r.spec.split(':').pop()} - ${r.why}`;
const gap = g => `${g.file}:${g.line} ${g.sev} §${g.id} ${g.name} - ${clip(g.text.trim(), 110)}`;
// Кандидат K решается по контексту: +-2 строки приложены,
// чтобы не открывать файл ради каждого
const candidate = g => [
    `${g.file}:${g.lines.join(',')} ${g.sev} §${g.id} ${g.name}`,
    ...[-2, -1, 0, 1, 2].map(d => g.line + d).filter(k => k >= 1 && k <= lengthOf(g.file))
        .map(k => `  ${k === g.line ? '>' : ' '}${k}| ${clip(linesOf(g.file)[k - 1].trim(), 140)}`),
].join('\n');
const pathLine = p => `план:${p.planLine} -> ${p.file}${p.from ? ` (было: ${p.from})` : ''} ${p.sev} §${p.id} ${p.name}`;
const debt = [...Map.groupBy(gapsY, g => `§${g.id} ${g.name}`)]
    .map(([rule, list]) => `${rule} - ${[...Map.groupBy(list, g => g.file)].map(([f, l]) => `${f} x${l.length}`).join(', ')}`);

const slicesLine = slices.map((s, i) => `v${i + 1}.md план:${s[0].planLine}–${s.at(-1).planLine} (${s.reduce((n, g) => n + g.items.length, 0)})`).join(' | ');
slices.forEach((s, i) => out.write(`v${i + 1}.md`, s.map(chkGroup).join('\n\n') + '\n'));
if (G !== 'parent') out.write('g.md', triage.map(candidate).join('\n\n') + '\n');

const section = (title, list, fmt) => `\n## ${title} (${list.length})\n\n${list.map(fmt).join('\n') || '_нет_'}\n`;
out.write('report.md', [
    `# isplan - сверка плана с кодом\n\n> \`${planFile}\` | ссылок ${refs.length} | файлов в scope ${scope.length} | V=${V} G=${G}\n`,
    section('INVALID - файла нет или строка за пределами файла', verdict.INVALID, ref),
    `\n## CHECK - ${verdict.CHECK.length} ссылок в ${groups.length} строках плана -> ${slicesLine || 'stdout'}\n`,
    section('OK - цитата плана стоит у указанной строки', verdict.OK, r => `план:${r.planLine} -> ${r.file}:${r.spec.split(':').pop()} - \`${clip(r.q, 60)}\``),
    section('EXTERNAL - исходники вне репозитория, не проверяются', verdict.EXTERNAL, r => `план:${r.planLine} -> ${r.spec}`),
    section('GAPS_C - нарушение в файле плана, планом не упомянуто', gapsC, gap),
    section('GAPS_K - 🔴 кандидаты, нужен контекст', gapsK, gap),
    section('GAPS_Y - 🟡 долг файлов плана, справочно', debt, s => s),
    section('PATHS - новые пути плана против правил по пути (§3.16 твёрдо, §3.17 вердикт родителя)', paths, pathLine),
].join(''));

const print = (title, list) => list.length && console.log(`\n${title}\n${list.join('\n')}`);
console.log(`REFS=${refs.length} INVALID=${verdict.INVALID.length} CHECK=${verdict.CHECK.length} OK=${verdict.OK.length} ` +
    `EXTERNAL=${verdict.EXTERNAL.length} GAPS_C=${gapsC.length} GAPS_K=${gapsK.length} GAPS_Y=${gapsY.length} PATHS=${paths.length} V=${V} G=${G} -> ${out.rel}/`);
if (slicesLine) console.log(`SLICES: ${slicesLine}`);
print('INVALID:', verdict.INVALID.map(ref));
print('GAPS_C:', gapsC.map(gap));
print('PATHS:', paths.map(pathLine));
if (V === 'parent') print('CHECK:', groups.map(chkGroup));
if (G === 'parent') print('GAPS_K:', triage.map(candidate));
