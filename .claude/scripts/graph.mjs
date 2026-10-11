// Граф импортов: циклы и радиус поражения. Read-only, ничего не пишет на диск.
//   node .claude/scripts/graph.mjs cycles [git-range]    - циклы; с range только задетые, новое ребро - [+], NEW=n внесённых
//   node .claude/scripts/graph.mjs deps <путь> [путь...]  - кто импортирует и что импортирует, по секции на путь
//
// import/no-cycle в eslint.config.js нет, а барельные циклы ломают init.
// Циклы - рантаймовые: целый `import type` / `export type ... from` стирается при сборке и ребра не даёт.
// В deps типовые импорты остаются: это радиус поражения при смене сигнатуры.
// Направление импортов здесь НЕ проверяется - это boundaries/dependencies в `pnpm lint`.
// Новое ребро - которого нет в графе базовой ревизии. Пути сверяются через пары переименований git,
// поэтому перенос файла рёбер не добавляет. Файл без пары считается добавленным целиком - все его импорты новые.
import { git, repo, imports, die } from './lib.mjs';

const CAP = 30;

// tests - только потребители: циклов не дают, но входят в радиус поражения.
// shadcn - вендорный генерат: в графе шум
const codeFiles = repo.files().filter(f => /^(app|src|shared|tests)\//.test(f) && !repo.vendored(f) && imports.code(f));
const edges = imports.edges(codeFiles);

const [mode, ...rest] = process.argv.slice(2);

// -- cycles

if (mode === 'cycles') {
    const cycles = imports.cycles(edges.filter(e => !e.type));

    // Цикл новый, если есть ребро, которого нет в базе.
    // Сверка по цели, не по тексту: перенос меняет спецификаторы
    let touched = null, fresh = () => false;
    if (rest.length) {
        // Граф с диска: к диффу диапазона добавлен дифф рабочей копии
        const range = git.diff(rest).files, local = git.diff().files;
        // `A...B` - от общего предка; `A..B` и `A` - от A
        const [left, right] = rest[0].split(/\.{2,3}/).map(r => r || 'HEAD');
        // Граф с рабочего дерева: диапазон не до HEAD выдал бы новым
        // всё, внесённое после него
        const commit = r => git.run('rev-parse', '--verify', `${r}^{commit}`).trim();
        if (right && commit(right) !== commit('HEAD')) die(`диапазон ${rest[0]} кончается не на HEAD, а граф читается с рабочего дерева`);
        const base = rest[0].includes('...') ? git.run('merge-base', left, right).trim() : left;
        const baseFiles = new Set(git.run('ls-tree', '-r', '--name-only', '-z', base).split('\0'));
        // Путь на диске -> путь в базе, null - там файла нет.
        // Файл диапазона мог быть переименован и незакоммиченно
        const was = f => f.status === 'A' ? null : f.from ?? f.path;
        const moved = new Map(local.filter(f => f.from).map(f => [f.from, f.path]));
        const origin = new Map(range.map(f => [moved.get(f.path) ?? f.path, was(f)]));
        // Вне диффа диапазона файл равен базе по своему пути, даже
        // если HEAD знает его под другим именем или не знает вовсе
        for (const f of local) if (!origin.has(f.path)) origin.set(f.path, baseFiles.has(was(f)) || !baseFiles.has(f.path) ? was(f) : f.path);
        const onDisk = new Map([...origin].filter(([, old]) => old !== null).map(([disk, old]) => [old, disk]));
        touched = new Set(origin.keys());
        // Цели импортёра в базе: текст оттуда, резолв по файлам базы
        // от старого пути - видно ребро, сменившее цель без правки
        const targets = new Map();
        const old = from => {
            if (!targets.has(from)) {
                const at = origin.has(from) ? origin.get(from) : from;
                const text = !baseFiles.has(at) ? '' : origin.has(from) ? git.run('show', `${base}:${at}`) : repo.read(from);
                targets.set(from, new Set(imports.specs(text).filter(s => s.kind === 'import' && !s.type)
                    .map(s => imports.resolve(s.spec, at, baseFiles)).filter(Boolean).map(t => onDisk.get(t) ?? t)));
            }
            return targets.get(from);
        };
        fresh = (from, to) => !old(from).has(to);
    }
    const isNew = c => c.slice(1).some((f, i) => fresh(c[i], f));
    // новый цикл бывает и без файлов из диффа: удалён файл,
    // заслонявший цель чужого импорта
    const hot = touched ? cycles.filter(c => c.some(f => touched.has(f)) || isNew(c)) : cycles;

    for (const c of hot.slice(0, CAP)) {
        console.log(`  ${c[0]}` + c.slice(1).map((f, i) => `\n    -> ${f}${fresh(c[i], f) ? '   [+ новое ребро]' : ''}`).join(''));
    }
    if (hot.length > CAP) console.log(`  ...ещё ${hot.length - CAP} циклов не показано`);
    if (!hot.length) console.log('  циклов нет');
    if (touched) {
        const n = hot.filter(isNew).length;
        console.log(`\nNEW=${n} - задетые циклы с новым ребром [+] (диапазон или незакоммиченное); остальные ${hot.length - n} существовали до него`);
    }

    console.log(touched
        ? `\nCYCLES=${cycles.length} TOUCHED=${hot.length} (диапазон ${rest.join(' ')})`
        : `\nCYCLES=${cycles.length}`);
    process.exit(0);
}

// -- deps

if (mode === 'deps' && rest.length) {
    const targets = rest.map(t => t.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, ''));
    const within = target => f => repo.under(f, target);
    const empty = targets.filter(t => !codeFiles.some(within(t)));
    if (empty.length === targets.length) die(`нет файлов кода под ${empty.join(', ')}`);
    // в плане рядом с существующими путями бывают не созданные:
    // отказ целиком стоил бы повторного вызова
    if (empty.length) console.log(`нет файлов кода под ${empty.join(', ')} - пропущено\n`);

    // Барель скрывает потребителей: импортёров десятки, а цель
    // отдаёт ему часть имён - берём тех, кто тянет проходящее имя
    const VIA = 'через ';
    const importers = Map.groupBy(edges, e => e.to);
    const reexports = Map.groupBy(edges.filter(e => e.reexport), e => e.from);
    const declared = new Map();
    const own = file => declared.get(file) ?? declared.set(file, imports.exported(repo.read(file))).get(file);
    // Реэкспорт пропускает имена источника: именованный - только
    // отдаваемые, `export *` - кроме default, `* as ns` - ns
    const pass = (entries, names) => entries.flatMap(({ name, as }) =>
        name !== '*' ? (names.has(name) ? [as] : [])
            : as === '*' ? [...names].filter(n => n !== 'default') : [as]);
    // Передача дальше: `export ... from` или пара `import { a }` +
    // `export { a }`. Переименование в паре не видно
    const relay = e => e.reexport ? e.names : e.names.filter(n => own(e.from).has(n.as));
    // что файл отдаёт: своё и пришедшее реэкспортом
    const provided = (file, trail = []) => {
        if (trail.includes(file)) return new Set();
        const names = new Set(own(file));
        for (const r of reexports.get(file) ?? []) for (const n of pass(r.names, provided(r.to, [...trail, file]))) names.add(n);
        return names;
    };

    targets.filter(t => !empty.includes(t)).forEach((target, k) => {
        const inside = within(target);
        const incoming = new Map();   // внешний потребитель -> что именно тянет
        const outgoing = new Map();   // куда наружу ходит сам target
        const note = (f, what) => {
            if (!incoming.has(f)) incoming.set(f, new Set());
            incoming.get(f).add(what);
        };
        // потребители бареля, берущие names; вложенные барели
        // проходятся насквозь и строкой не выводятся
        const through = (barrel, names, trail) => {
            for (const c of importers.get(barrel) ?? []) {
                if (inside(c.from)) continue;
                const hop = relay(c);
                if (c.names.some(n => !hop.includes(n) && (n.name === '*' || names.has(n.name)))) note(c.from, VIA + barrel);
                if (hop.length && !trail.includes(c.from)) through(c.from, new Set(pass(hop, names)), [...trail, c.from]);
            }
        };
        for (const e of edges) {
            if (inside(e.to) && !inside(e.from)) {
                note(e.from, e.spec);
                const hop = relay(e);
                if (hop.length) through(e.from, new Set(pass(hop, provided(e.to))), [e.from]);
            }
            if (inside(e.from) && !inside(e.to)) {
                if (!outgoing.has(e.to)) outgoing.set(e.to, new Set());
                outgoing.get(e.to).add(e.from);
            }
        }

        const dump = (title, map, fmt) => {
            console.log(`\n${title} (${map.size})`);
            const rows = [...map.entries()].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]));
            for (const [f, v] of rows.slice(0, CAP)) console.log(`  ${fmt(f, v)}`);
            if (rows.length > CAP) console.log(`  ...ещё ${rows.length - CAP} не показано`);
        };

        if (k) console.log('\n' + '-'.repeat(60) + '\n');
        console.log(`${target} - ${codeFiles.filter(inside).length} файлов кода`);
        dump('Импортируют извне - радиус поражения', incoming,
            (f, specs) => `${f}  [${[...specs].sort((a, b) => a.startsWith(VIA) - b.startsWith(VIA)).join(' ')}]`);
        dump('Импортирует наружу', outgoing, (f, from) => `${f}  (из ${from.size})`);
        console.log(`\nINCOMING=${incoming.size} OUTGOING=${outgoing.size}`);
    });
    process.exit(0);
}

die('использование: graph.mjs cycles [git-range] | graph.mjs deps <путь> [путь...]');
