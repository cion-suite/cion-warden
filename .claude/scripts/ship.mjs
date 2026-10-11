// Pre-flight перед merge: typecheck, lint, тесты, скан ветки и циклы - параллельно; всё чисто -> сборка приложения.
//   node .claude/scripts/ship.mjs [range] [--no-build]   - range: main...HEAD, на main - origin/main..HEAD
// Stdout - таблица итогов и <=20 значимых строк на провал; полный вывод - .claude/cache/ship/*.log.
// READY TO MERGE -> exit 0, кеш удалён. ISSUES FOUND -> exit 1, логи остаются.
import path from 'node:path';
import { ROOT, die, git, repo, cache, sh } from './lib.mjs';

const args = process.argv.slice(2);
const BASE = 'main';
const NO_BUILD = args.includes('--no-build');
const pos = args.filter(a => a !== '--no-build');
if (pos.length > 1 || pos[0]?.startsWith('-')) die('использование: ship.mjs [range] [--no-build]');
const range = pos[0] ?? (git.run('branch', '--show-current').trim() === BASE ? `origin/${BASE}..HEAD` : `${BASE}...HEAD`);
// битый range иначе всплыл бы двумя провалами (скан, циклы)
// уже после минуты проверок
git.run('rev-parse', range);

const pkg = JSON.parse(repo.read('package.json'));
const typecheck = pkg.scripts?.typecheck ?? die('в package.json нет scripts["typecheck"]');

// -- разбор логов

const lines = s => s.split('\n').filter(l => l.trim());
const num = (s, re) => Number(s.match(re)?.[1] ?? 0);
const failed = r => `провал, код ${r.code}`;
const STACK = /^\s+at /;
// Упал инструмент: строки с ошибкой без стека, иначе хвост.
// ERR_ - коды pnpm: причина там, `[ERROR]` - только обёртка
const gist = s => {
    const err = lines(s).filter(l => /error|ERR_|failed|ОТКАЗ/i.test(l) && !STACK.test(l));
    return err.length ? err : lines(s).slice(-20);
};

const tsc = (r, s) => {
    const errs = lines(s).filter(l => /error TS\d+/.test(l));
    return { block: !r.ok, note: r.ok ? 'ok' : errs.length ? `ошибок: ${errs.length}` : failed(r), detail: errs };
};

// stylish: путь, под ним "  12:5  error  текст  правило";
// предупреждения - baseline, в детали не идут
const eslint = (r, s) => {
    const detail = [];
    let file = '';
    for (const l of lines(s)) {
        if (/^([A-Za-z]:)?[\\/]/.test(l)) file = path.relative(ROOT, l.trim()).replaceAll('\\', '/');
        else if (/^\s+\d+:\d+\s+error\s/.test(l)) detail.push(`${file}:${l.trim().replace(/\s{2,}/g, '  ')}`);
    }
    const errors = num(s, /(\d+) errors?,/), warnings = num(s, /(\d+) warnings?\)/);
    const warn = warnings ? `, предупреждений: ${warnings}` : '';
    return { block: !r.ok, note: r.ok ? `ok${warn}` : errors ? `ошибок: ${errors}${warn}` : failed(r), detail };
};

const vitest = (r, s) => {
    const tests = s.match(/^\s*Tests\s+(.+)$/m)?.[1] ?? '';
    const bad = num(tests, /(\d+) failed/);
    return {
        block: !r.ok,
        note: r.ok ? `ok, тестов: ${num(tests, /(\d+) passed/)}` : bad ? `провалов: ${bad}` : failed(r),
        detail: lines(s).filter(l => /^\s*FAIL\s|Error\b|❯ \S+:\d+:\d+/.test(l) && !STACK.test(l)),
    };
};

const scan = (r, s) => {
    const ls = lines(s);
    const total = ls.find(l => /CONFIRMED=\d+/.test(l));
    if (!total) return { block: true, note: failed(r), detail: [] };
    const confirmed = num(total, /CONFIRMED=(\d+)/);
    const note = /FILES=0\b/.test(total) ? 'диффа нет' : `CONFIRMED=${confirmed} CHECK=${num(total, /CHECK=(\d+)/)}`;
    return { block: !r.ok || confirmed > 0, note, detail: ls.filter(l => l !== total) };
};

const cycles = (r, s) => {
    const ls = lines(s);
    const at = ls.findIndex(l => /^CYCLES=\d+/.test(l));
    if (at < 0) return { block: true, note: failed(r), detail: [] };
    // Блокирует только внесённый веткой цикл: на унаследованном
    // гейт срабатывал бы на каждом прогоне. Без NEW= - по TOUCHED
    const touched = num(ls[at], /TOUCHED=(\d+)/), fresh = s.match(/NEW=(\d+)/)?.[1];
    return {
        block: !r.ok || (fresh === undefined ? touched > 0 : Number(fresh) > 0),
        note: `${fresh === undefined ? '' : `NEW=${fresh}, `}TOUCHED=${touched} из CYCLES=${num(ls[at], /CYCLES=(\d+)/)}`,
        detail: ls.slice(0, at),
    };
};

// причина провала сборки - в хвосте лога
const buildResult = r => ({ block: !r.ok, note: r.ok ? 'ok' : failed(r), detail: sh.tail(r.log, 20) });

// -- прогон

// части typecheck - из package.json: новый tsconfig
// подхватится сам
const checks = [
    ...typecheck.split('&&').map(cmd => cmd.trim()).map(cmd => {
        const name = cmd.match(/tsconfig\.(\w+)\.json/)?.[1] ?? cmd.match(/typecheck:(\S+)/)?.[1] ?? cmd.replace(/\W+/g, '-');
        return { name: `typecheck ${name}`, log: `typecheck-${name}`, cmd, parse: tsc };
    }),
    { name: 'lint', log: 'lint', cmd: 'pnpm lint', parse: eslint },
    { name: 'test', log: 'test', cmd: 'pnpm test', parse: vitest },
    { name: 'скан', log: 'scan', cmd: `node .claude/scripts/diff-scan.mjs "${range}" --totals`, parse: scan },
    { name: 'циклы', log: 'cycles', cmd: `node .claude/scripts/graph.mjs cycles "${range}"`, parse: cycles },
];

const out = cache.open('ship');
const stage = list => Promise.all(list.map(async c => {
    const r = await sh.run(c.cmd, out.path(`${c.log}.log`));
    return { ...c, r, ...c.parse(r, sh.text(r.log)) };
}));

const t0 = performance.now();
const first = await stage(checks);
const blocked = first.some(x => x.block);
// Сборка - после проверок: ошибки бандлинга (renderer-код
// в main, пути ресурсов) typecheck и lint не видят
const build = { name: 'build', log: 'build', cmd: 'pnpm build', parse: buildResult };
const second = [];
if (!blocked && !NO_BUILD) second.push((await stage([build]))[0]);

// -- вывод

const secs = ms => `${(ms / 1000).toFixed(1)} с`;
const all = [...first, ...second];

console.log(`ship ${range} | ${pkg.version}\n`);
for (const x of all) console.log(`${x.name.padEnd(19)}${x.note.padEnd(36)}${secs(x.r.ms).padStart(8)}`);
if (!second.length) console.log(`${build.name.padEnd(19)}${NO_BUILD ? 'пропущен (--no-build)' : 'пропущен - блокеры выше'}`);

for (const x of all.filter(x => x.block)) {
    const detail = x.detail.length ? x.detail : gist(sh.text(x.r.log));
    console.log(`\n-- ${x.name}: ${x.note} - ${out.rel}/${x.log}.log`);
    for (const l of detail.slice(0, 20)) console.log(`  ${l.trimEnd().slice(0, 240)}`);
    if (detail.length > 20) console.log(`  ...ещё ${detail.length - 20}`);
}

const ready = !all.some(x => x.block);
if (ready) out.drop();
const wall = secs(performance.now() - t0);
console.log(ready
    ? `\n-> READY TO MERGE${NO_BUILD ? ' (build не проверялся)' : ''} | ${wall}`
    : `\n-> ISSUES FOUND | ${wall} | логи ${out.rel}/`);
process.exitCode = ready ? 0 : 1;
