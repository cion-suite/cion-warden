// Механический скан диффа по rules.mjs + маршрут ревью для /isgood. Код не трогает.
// Находки - по добавленным строкам и по пути файлов со статусом A и R (правила path: true).
//   node .claude/scripts/diff-scan.mjs [git-diff-args...]   - без аргументов: незакоммиченное (HEAD + untracked)
//   node .claude/scripts/diff-scan.mjs --totals [args...]   - строка итогов + CONFIRMED, кеш не трогает (/ship)
//   node .claude/scripts/diff-scan.mjs --selftest           - самопроверка rules.mjs
// Пишет .claude/cache/isgood/: report.md; ROUTE=inline|S - code.patch, ROUTE=S2 - s1/s2.patch; T=<n> - t1...t3.md.
// Пустой дифф - кеш не создаётся.
import { git, repo, cache } from './lib.mjs';
import { match, matchPath, selftest } from './rules.mjs';

const argv = process.argv.slice(2);
if (argv.includes('--selftest')) process.exit(selftest());
const TOTALS = argv.includes('--totals');
// Кеш сносится до git: иначе при битой ревизии
// отчёт прошлого прогона пережил бы отказ
const out = TOTALS ? null : cache.open('isgood');
const diff = git.diff(argv.filter(a => a !== '--totals'));

// -- находки с контекстом

const CTX = 2, WIDTH = 160;

// Контекст находки в строках: триаж не открывает файлы
const context = (f, n) => {
    const rows = [];
    for (let i = n - CTX; i <= n + CTX; i++) if (f.post.has(i)) rows.push([i, f.post.get(i).trimEnd()]);
    const indent = Math.min(...rows.filter(([, t]) => t.trim()).map(([, t]) => t.match(/^\s*/)[0].length));
    const w = String(rows.at(-1)[0]).length;
    return rows.map(([i, t]) => {
        const s = t.slice(indent);
        return `    ${i === n ? '>' : ' '} ${String(i).padStart(w)}  ${s.length > WIDTH ? `${s.slice(0, WIDTH)}...` : s}`.trimEnd();
    }).join('\n');
};

// Ближайшая непустая строка выше из хунка - для WHY-исключений
const above = (f, n) => {
    for (let i = n - 1; f.post.has(i); i--) if (f.post.get(i).trim()) return f.post.get(i);
};

const textFindings = diff.files.flatMap(f => f.added.flatMap(a => match(a.text, f.path, above(f, a.line)).map(r => ({
    ...r, file: f.path,
    block: `${f.path}:${a.line} ${r.sev} §${r.id} ${r.name}\n${context(f, a.line)}`,
}))));
// Перенос строк не добавляет, но путь может внести нарушение:
// matchPath молчит, если старый путь нарушал то же правило
const pathFindings = diff.files.filter(f => f.status === 'A' || f.status === 'R').flatMap(f => matchPath(f.path, f.from).map(r => ({
    ...r, file: f.path,
    block: `${f.path} ${r.sev} §${r.id} ${r.name}${f.from ? ` (было: ${f.from})` : ''}`,
})));
const findings = [...textFindings, ...pathFindings];
const confirmed = findings.filter(x => x.tier === 'C');
const check = findings.filter(x => x.tier === 'K');

// -- маршрут

// Inline дешевле агента, пока код мал и не в SENSITIVE.
// INLINE_LINES: +150 -3000 - не малый дифф для родителя
const INLINE = 200, INLINE_LINES = 600, SPLIT = 800, TRIAGE = 25;
const SENSITIVE = [
    /^src\/(shell|entities|kit|ui|lib)\//, /^app\/(shell|system|updater)\//, /^app\/(main|preload)\.ts$/,
    /^shared\/(types\/(app-events|ipc-channels)|schema|settings|config)\.ts$/,
];

const sum = files => files.reduce((n, f) => n + f.plus, 0);

// Жадно в самую лёгкую группу, тяжёлые первыми;
// порядок внутри - исходный
const split = (items, n, weight) => {
    const groups = Array.from({ length: n }, () => ({ w: 0, items: new Set() }));
    for (const it of [...items].sort((a, b) => weight(b) - weight(a))) {
        const g = groups.reduce((a, b) => b.w < a.w ? b : a);
        g.items.add(it);
        g.w += weight(it);
    }
    return groups.map(g => items.filter(it => g.items.has(it))).filter(g => g.length);
};

// Удалённый файл - сотни "-": ревьюеру хватит факта удаления
const body = f => {
    const at = f.patch.search(/^(---|Binary|@@)/m);
    return f.status === 'D' && at > 0 ? `${f.patch.slice(0, at)}(файл удалён целиком: -${f.minus})\n` : f.patch;
};
const patch = files => files.map(body).join('');
const lines = files => files.reduce((n, f) => n + body(f).split('\n').length - 1, 0);

const kind = new Map(diff.files.map(f => [f.path, f.bin ? 'noise' : repo.kind(f.path)]));
const code = diff.files.filter(f => kind.get(f.path) === 'code');
const codeAdded = sum(code);
// Срез - целые каталоги: исходник, тест и соседи вместе
const dirOf = f => f.path.slice(0, Math.max(0, f.path.lastIndexOf('/')));
const slices = codeAdded > SPLIT
    ? split([...Map.groupBy(code, dirOf).values()], 2, lines).map(g => g.flat())
    : [code];
const route = !code.length ? 'none'
    : codeAdded <= INLINE && lines(code) <= INLINE_LINES && !code.some(f => SENSITIVE.some(r => r.test(f.path))) ? 'inline'
    : slices.length > 1 ? 'S2' : 'S';

const byFile = [...Map.groupBy(check, x => x.file).values()];
const groups = check.length > TRIAGE ? split(byFile, Math.min(3, Math.ceil(check.length / TRIAGE)), g => g.length) : [];
const T = groups.length || 'parent';

const plan = diff.files.some(f => f.path === 'docs/planned-now.md');
const totals = `FILES=${diff.files.length} CODE=${code.length} ADDED=${sum(diff.files)} CODE_ADDED=${codeAdded} `
    + `CONFIRMED=${confirmed.length} CHECK=${check.length} ROUTE=${route} T=${T} PLAN=${plan ? 'touched' : 'no'}`;

const blocks = xs => xs.map(x => x.block).join('\n');

if (TOTALS) {
    console.log(totals);
    if (confirmed.length) console.log(blocks(confirmed));
    process.exit(0);
}

// -- кеш и вывод

if (!diff.files.length) {
    console.log('EMPTY - диффа нет, кеш не создан');
    process.exit(0);
}

if (route === 'inline' || route === 'S') out.write('code.patch', patch(code));
if (route === 'S2') slices.forEach((g, i) => out.write(`s${i + 1}.patch`, patch(g)));
groups.forEach((g, i) => out.write(`t${i + 1}.md`, `${blocks(g.flat())}\n`));

const tag = new Map();
if (route === 'S2') slices.forEach((g, i) => g.forEach(f => tag.set(f.path, ` s${i + 1}`)));
groups.forEach((g, i) => g.forEach(([x]) => tag.set(x.file, `${tag.get(x.file) ?? ''} t${i + 1}`)));
const table = diff.files.map(f => `${f.path} ${f.status} +${f.plus} -${f.minus} ${kind.get(f.path)}${tag.get(f.path) ?? ''}`).join('\n');

const section = (title, xs) => `## ${title} (${xs.length})\n\n${xs.length ? blocks(xs) : '_нет_'}\n`;
out.write('report.md', `# isgood - механический скан\n\n> ${diff.spec}\n> ${totals}\n\n`
    + `${section('CONFIRMED - нарушение, триаж не нужен', confirmed)}\n${section('CHECK - кандидаты', check)}\n`
    + `## Файлы (путь статус +/- вид [срез S2] [группа T])\n\n${table}\n`);

// Родителю хватает stdout: CHECK - когда триажит он сам,
// список файлов - пока короткий
console.log(`${totals} -> ${out.rel}/`);
if (confirmed.length) console.log(`\nCONFIRMED\n${blocks(confirmed)}`);
if (T === 'parent' && check.length) console.log(`\nCHECK\n${blocks(check)}`);
if (diff.files.length <= 20) console.log(`\nФАЙЛЫ\n${table}`);
