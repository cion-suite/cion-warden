// Общее для скриптов .claude/scripts: файлы репозитория, git и дифф, импорты, кеш, дочерние процессы.
//   node .claude/scripts/lib.mjs    - самопроверка парсера импортов
// Новый помощник клади сюда, в его namespace, а не копией в скрипт: копии расходятся
// в исключениях обхода и в том, видят ли они untracked.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';

export const ROOT = path.resolve(import.meta.dirname, '../..');

export const die = msg => { console.error(`ОТКАЗ: ${msg}`); process.exit(1); };

// -- git

// core.quotepath=false: иначе кириллица в путях приходит
// октальными escape'ами и ломает разбор
const run = (...args) => {
    try {
        return execFileSync('git', ['-c', 'core.quotepath=false', ...args],
            { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
        return die(`git ${args.join(' ')} - ${String(e.stderr || e.message).trim()}`);
    }
};

// Порог явный: от умолчаний git зависят пары переименований.
// -l0: сверх renameLimit перенос выглядит как D + A
const RENAMES = ['-M30%', '-l0'];
// Префиксы явные: diff.noprefix и diff.mnemonicPrefix
// в конфиге ломают разбор путей
const DIFF = ['diff', '--no-color', '--no-ext-diff', ...RENAMES, '--src-prefix=a/', '--dst-prefix=b/'];

// путь с пробелом git закрывает в `---`/`+++` табуляцией:
// без среза `.ts\t` выпадает из правил и repo.kind
const unquote = p => p.replace(/\t$/, '').replace(/^"|"$/g, '');

// Контекст находки - post-image из хунков, а не диск:
// рабочее дерево может не совпадать с диапазоном
const parseFile = chunk => {
    const f = { path: '', status: 'M', bin: false, plus: 0, minus: 0, added: [], removed: [], hunks: [], post: new Map(), patch: chunk };
    let n = 0, inHunk = false, from = '', to = '';
    for (const ln of chunk.split(/\r?\n/)) {
        if (ln.startsWith('@@')) {
            inHunk = true;
            n = Number(ln.match(/\+(\d+)/)?.[1] ?? 0);
            f.hunks.push(ln.replace(/^@@[^@]*@@\s?/, ''));
        } else if (!inHunk) {
            if (ln.startsWith('+++ ')) to = unquote(ln.slice(4));
            else if (ln.startsWith('--- ')) from = unquote(ln.slice(4));
            else if (ln.startsWith('new file')) f.status = 'A';
            else if (ln.startsWith('deleted file')) f.status = 'D';
            else if (ln.startsWith('rename from ')) { f.status = 'R'; f.from = unquote(ln.slice(12)); }
            // у переименования без правок нет `---`/`+++`, а путь
            // с ` b/` из `diff --git` не вынуть
            else if (ln.startsWith('rename to ')) to = 'b/' + unquote(ln.slice(10));
            else if (ln.startsWith('Binary files')) f.bin = true;
        } else if (ln.startsWith('+')) {
            f.added.push({ line: n, text: ln.slice(1) });
            f.post.set(n++, ln.slice(1));
            f.plus++;
        } else if (ln.startsWith('-')) {
            f.removed.push(ln.slice(1));
            f.minus++;
        } else if (ln.startsWith(' ')) f.post.set(n++, ln.slice(1));
    }
    const head = chunk.slice(0, chunk.indexOf('\n'));
    f.path = to && to !== '/dev/null' ? to.slice(2)
        : from && from !== '/dev/null' ? from.slice(2)
        : unquote(head.slice(head.indexOf(' b/') + 3));
    return f;
};

const parse = text => text.split(/^(?=diff --git )/m).filter(c => c.startsWith('diff --git ')).map(parseFile);

// `git diff` untracked не видит - синтезируем патч сами
// (`--no-index` спотыкается о /dev/null на Windows)
const untracked = paths => run('ls-files', '--others', '--exclude-standard', '-z', '--', ...paths)
    .split('\0').filter(Boolean)
    .map(f => {
        let body;
        try { body = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { return ''; }
        const head = `diff --git a/${f} b/${f}\nnew file mode 100644\n`;
        if (body.includes('\0')) return `${head}Binary files /dev/null and b/${f} differ\n`;
        if (!body) return head;
        const lines = body.replace(/\r?\n$/, '').split(/\r?\n/);
        return `${head}--- /dev/null\n+++ b/${f}\n@@ -0,0 +1,${lines.length} @@\n${lines.map(l => '+' + l).join('\n')}\n`;
    })
    .join('');

export const git = {
    run,
    // Без ревизий - `git diff HEAD` + untracked. Пути после `--`;
    // исключение: `-- . ':(exclude)<путь>'` и для untracked
    diff(args = []) {
        const sep = args.indexOf('--');
        const revs = sep < 0 ? args : args.slice(0, sep);
        const paths = sep < 0 ? [] : args.slice(sep + 1);
        const mode = revs.length ? 'range' : 'uncommitted';
        const text = mode === 'range'
            ? run(...DIFF, ...args)
            : run(...DIFF, 'HEAD', '--', ...paths) + untracked(paths);
        const spec = mode === 'range' ? args.join(' ') : `HEAD + untracked${paths.length ? ` -- ${paths.join(' ')}` : ''}`;
        return { mode, spec, revs, paths, text, files: parse(text) };
    },
};

// -- файлы репозитория

// По git, не обходом диска: обход заходит в build/, а
// исключение по `cache` спрятало бы и src/lib/cache/.
// SKIPPED - страховка от tracked-мусора вне исходников
let listed, byName;

// shadcn - вендорный генерат: ревью и дайджест его не читают
const VENDORED = /^src\/ui\/shadcn\//;
const SKIPPED = /^(?:build|node_modules|\.claude\/cache)\//;
const NOISE =/(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$|^docs\/versions\/|\.(png|jpe?g|gif|ico|icns|svg|woff2?|ttf|exe|dll|zip)$/i;
const DOC = /\.(md|txt)$/i;

export const repo = {
    files: () => listed ??= run('ls-files', '--cached', '--others', '--exclude-standard', '-z')
        .split('\0').filter(f => f && !SKIPPED.test(f) && fs.existsSync(path.join(ROOT, f))),
    exists: f => fs.existsSync(path.join(ROOT, f)),
    read: f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { return ''; } },
    lines: f => repo.read(f).split(/\r?\n/),
    // строк по repo.lines: конечный перевод строки не в счёт
    count: lines => lines.length - (lines.at(-1) === '' ? 1 : 0),
    // номера из ссылки `файл:44,56-62` -> [[44, 44], [56, 62]]
    spans: nums => nums.split(',').map(s => s.split('-').map(Number)).map(([a, b = a]) => [a, b]),
    // путь лежит в каталоге или сам им является
    under: (p, dir) => p === dir || p.startsWith(dir + '/'),
    // Ссылка из текста на файл: путь от корня, кратчайший суффикс
    // или алиас сборки; `.../` и `./` - форма цитаты, не путь
    find: ref => {
        const s = ref.replace(/^@\//, 'src/').replace(/^(\.\.\.\/|\.\/|@)/, '');
        byName ??= Map.groupBy(repo.files(), f => f.slice(f.lastIndexOf('/') + 1));
        return (byName.get(s.slice(s.lastIndexOf('/') + 1)) ?? []).filter(f => f === s || f.endsWith('/' + s));
    },
    // вендорный генерат: не ревьюится и не участвует в графе
    vendored: f => VENDORED.test(f),
    // что значит файл для ревью: код, проза или шум
    kind: f => NOISE.test(f) || VENDORED.test(f) ? 'noise' : DOC.test(f) ? 'doc' : 'code',
};

// -- импорты

// Комментарии, строки и regex-литералы - лексемы, не код;
// JSX-текст не распознаётся: `/*` в нём откроет комментарий
const LEXEME = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|(?<=[=(,:!&|?{};[]\s*|\breturn\s+)\/(?![/*])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+\/[a-z]*|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g;
// начало оператора: файл (с BOM), перевод строки или `;`
const STATEMENT = '(?:^\\uFEFF?|[\\n;])[ \\t]*';
// Группы спецификатора: 1 - `... from '...'`,
// 2 - `import('...')`, 3 - `import '...'`
const SPEC = {
    // Между `import` и `from` - лишь список имён, иначе
    // `import './a'` не должен стать началом `import x from`
    import: new RegExp([
        `${STATEMENT}(?:import|export)\\b[\\w$\\s{},*]{0,8000}?\\bfrom\\s*['"]([^'"]+)['"]`,
        `(?:^|[^.\\w])import\\s*\\(\\s*['"]([^'"]+)['"]\\s*\\)`,
        `${STATEMENT}import\\s*['"]([^'"]+)['"]`,
    ].join('|'), 'dg'),
    // перед скобкой бывает generic со своим import():
    // vi.importActual<typeof import('./x')>('./x')
    mock: /\bvi\.(?:mock|doMock|unmock|doUnmock|importActual|importMock)\s*(?:<[\s\S]{0,200}?>\s*)?\(\s*['"]([^'"]+)['"]/dg,
    declare: /\bdeclare\s+module\s+['"]([^'"]+)['"]/dg,
};
const ALIAS = [['@app/', 'app/'], ['@shared/', 'shared/'], ['@/', 'src/']];
const SUFFIX = ['', '.ts', '.tsx', '.js', '/index.ts', '/index.tsx', '/index.js'];
const INDEX = ['index.ts', 'index.tsx', 'index.js'];
// `.`, `..`, `../x/`, `@/a/` - спецификатор-каталог
const DIR_SPEC = /(?:^|\/)\.{1,2}$|\/$/;
// расширения, которые SUFFIX подбирает сам; остальные
// (json, css) пишутся в спецификаторе целиком
const CODE_EXT = /\.(?:tsx?|js)$/;
// после `import` / `export` - целый `type`, а не имя default
// (`import type from`, `import type, { a } from`)
const TYPE_ONLY = /^type(?=[\s{*])\s*(?=[\w${*])/;
const DECLARED = new RegExp(`${STATEMENT}export\\s+(?:declare\\s+)?(?:(?:(?:abstract\\s+)?class|interface|type|(?:const\\s+)?enum|namespace|const|let|var)\\s+|(?:async\\s+)?function\\b\\s*\\*?\\s*)([\\w$]+)`, 'g');
const DEFAULT = new RegExp(`${STATEMENT}export\\s+default\\b`);
const LISTED = new RegExp(`${STATEMENT}export\\s+(?:type\\s+)?\\{([^}]*)\\}(?!\\s*from\\b)`, 'g');
// не оператор или без привязок: ни type, ни реэкспорта
const plain = (names = []) => ({ type: false, reexport: false, names });
let everything;

const blank = s => s.replace(/[^\r\n]/g, ' ');
// Строки остаются: в них ищется спецификатор.
// Template гасится: `import ... from` в нём не оператор
const mask = text => text.replace(LEXEME, c => /^\/[/*]/.test(c) ? blank(c) : c[0] === '`' ? `\`${blank(c.slice(1, -1))}\`` : c);

// `a, type b, c as d` -> [{ name, as }]. `type` снимается,
// кроме имени `type` и пар `type as foo` / `type as as`
const members = list => list.split(',').map(s => s.trim().split(/\s+/)).filter(t => t[0]).map(t => {
    if (t[0] === 'type' && t.length !== 1 && !(t.length === 3 && t[1] === 'as')) t.shift();
    return { name: t[0], as: t[2] ?? t[0] };
});

// Голова до спецификатора -> { type, reexport, names }.
// name `*` - весь модуль (namespace, default, `export *`)
const operation = (head, group) => {
    if (group === 2) return plain([{ name: '*' }]);
    if (group === 3) return plain();
    // голова проглатывает `export { a }` без `from` перед
    // настоящим `import ... from` - берётся последний оператор
    const statement = head.replace(/\bfrom\s*['"]$/, '').split(/[\n;][ \t]*(?=(?:import|export)\b)/).at(-1).trim();
    const [, keyword, tail] = statement.match(/^(import|export)\s*([\s\S]*)$/);
    const type = TYPE_ONLY.test(tail);
    const rest = type ? tail.replace(TYPE_ONLY, '') : tail;
    const whole = rest.replace(/\{[^}]*\}/, '').split(',').map(s => s.trim()).filter(Boolean)
        .map(s => ({ name: '*', as: s.split(/\s+/).at(-1) }));
    return { type, reexport: keyword === 'export', names: [...whole, ...members(rest.match(/\{([^}]*)\}/)?.[1] ?? '')] };
};

export const imports = {
    // файл, в котором бывают импорты
    code: f => /\.(ts|tsx|js|mjs)$/.test(f),
    // type - целое `import type` / `export type ... from`.
    // Комментарии гасятся пробелами: иначе at поплывёт
    specs(text) {
        const code = mask(text);
        return Object.entries(SPEC)
            .flatMap(([kind, re]) => [...code.matchAll(re)].map(m => {
                const group = m.indices.findIndex((range, g) => g && range);
                const [at, end] = m.indices[group];
                const detail = kind === 'import' ? operation(m[0].slice(0, at - m.index), group) : plain();
                return { spec: text.slice(at, end), at, kind, ...detail };
            }))
            .sort((a, b) => a.at - b.at);
    },
    // Объявленные в файле имена; реэкспорты - в specs.
    // `const a = 1, b = 2` - только a; `{ a } = x` - ничего
    exported(text) {
        const code = mask(text);
        const names = new Set([...code.matchAll(DECLARED)].map(m => m[1]));
        if (DEFAULT.test(code)) names.add('default');
        for (const m of code.matchAll(LISTED)) for (const { as } of members(m[1])) names.add(as);
        return names;
    },
    // путь от корня без подбора расширения; null - пакет
    path(spec, from) {
        const alias = ALIAS.find(([prefix]) => spec.startsWith(prefix));
        if (alias) return alias[1] + spec.slice(alias[0].length);
        return spec.startsWith('.') ? path.posix.join(path.posix.dirname(from), spec) : null;
    },
    // known - набор файлов резолва (до диффа, после переноса).
    // Как TS: каталог - только `/index.*`; `.js` -> `.ts`/`.tsx`
    resolve(spec, from, known = everything ??= new Set(repo.files())) {
        const base = imports.path(spec, from);
        if (base === null) return null;
        const candidates = DIR_SPEC.test(spec) ? INDEX.map(i => path.posix.join(base, i))
            : spec.endsWith('.js') ? [...['.ts', '.tsx'].map(e => base.slice(0, -3) + e), base]
            : SUFFIX.map(s => base + s);
        return candidates.find(c => known.has(c)) ?? null;
    },
    // путь без расширения, которое подбирает SUFFIX;
    // null - файл другого рода (json, css)
    stem: f => CODE_EXT.test(f) ? f.replace(CODE_EXT, '') : null,
    // Обратное resolve: спецификатор target в стиле like.
    // Алиас, пока цель под его корнем; `.js` и `/index` целы
    specFor(target, importer, like) {
        const stem = imports.stem(target);
        let named = target;
        if (stem !== null) {
            if (like.endsWith('.js')) named = stem + '.js';
            else if (!CODE_EXT.test(like)) named = path.posix.basename(stem) === 'index' && !like.endsWith('/index') ? path.posix.dirname(stem) : stem;
        }
        const alias = ALIAS.find(([prefix, root]) => like.startsWith(prefix) && named.startsWith(root));
        if (alias) return alias[0] + named.slice(alias[1].length);
        const rel = path.posix.relative(path.posix.dirname(importer), named) || '.';
        return /^\.\.?(\/|$)/.test(rel) ? rel : './' + rel;
    },
    // рёбра - только настоящие импорты: vi.mock и declare module
    // модуль называют, но не подключают
    edges: files => files.flatMap(from => imports.specs(repo.read(from))
        .filter(s => s.kind === 'import')
        .map(({ spec, type, reexport, names }) => ({ from, to: imports.resolve(spec, from), spec, type, reexport, names }))
        .filter(e => e.to && e.to !== from)),
    // Простые циклы { from, to } как [a, b, ..., a], до MAX узлов
    cycles(edges) {
        const adj = new Map();
        for (const e of edges) {
            if (!adj.has(e.from)) adj.set(e.from, new Set());
            adj.get(e.from).add(e.to);
        }

        // Tarjan: цикл живёт в компоненте связности из >= 2 узлов
        const comps = [], index = new Map(), low = new Map(), onStack = new Set(), stack = [];
        const connect = v => {
            index.set(v, index.size); low.set(v, index.get(v)); stack.push(v); onStack.add(v);
            for (const nb of adj.get(v) || []) {
                if (!index.has(nb)) { connect(nb); low.set(v, Math.min(low.get(v), low.get(nb))); }
                else if (onStack.has(nb)) low.set(v, Math.min(low.get(v), index.get(nb)));
            }
            if (low.get(v) !== index.get(v)) return;
            const comp = [];
            let w;
            do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== v);
            if (comp.length > 1) comps.push(comp.sort());
        };
        for (const n of adj.keys()) if (!index.has(n)) connect(n);

        // Цикл ищется от наименьшего узла, по узлам не меньше него.
        // DFS по обратным рёбрам теряет циклы и зависит от порядка
        const MAX = 6;
        const cycles = [], seen = new Set();
        for (const comp of comps) {
            const rank = new Map(comp.map((n, i) => [n, i]));
            for (const s of comp) {
                const trail = [s];
                const walk = v => {
                    for (const nb of adj.get(v) || []) {
                        if (!(rank.get(nb) >= rank.get(s))) continue;
                        if (nb === s) {
                            const key = [...trail].sort().join('|');
                            if (!seen.has(key)) { seen.add(key); cycles.push([...trail, s]); }
                        } else if (trail.length < MAX && !trail.includes(nb)) {
                            trail.push(nb); walk(nb); trail.pop();
                        }
                    }
                };
                walk(s);
            }
        }
        return cycles;
    },
};

// -- кеш

export const cache = {
    // Каталог сносится при открытии, создаётся при записи:
    // старый отчёт не прочитать. keep - для шага после записи
    open(name, { keep = false } = {}) {
        const rel = `.claude/cache/${name}`;
        const dir = path.join(ROOT, rel);
        if (!keep) fs.rmSync(dir, { recursive: true, force: true });
        const at = file => {
            fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
            return path.join(dir, file);
        };
        return {
            rel,
            dir,
            path: at,
            write: (file, body) => { fs.writeFileSync(at(file), body, 'utf8'); return `${rel}/${file}`; },
            drop: () => fs.rmSync(dir, { recursive: true, force: true }),
        };
    },
};

// -- дочерние процессы

// Windows хранит переменную как `Path`: второй ключ `PATH`
// в копии env дал бы дочернему процессу два пути
const PATH_KEY = Object.keys(process.env).find(k => k.toUpperCase() === 'PATH') ?? 'PATH';

// picocolors (vite) красит вывод на win32 и без TTY: NO_COLOR
// гасит уважающих его, остальное режет text()
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;
// NODE_TLS_REJECT_UNAUTHORIZED=0: каждый дочерний node
// пишет предупреждение в каждый лог
const NODE_WARN = /^\(node:\d+\) Warning:|^\(Use `node --trace-warnings/;
const VITE_CHUNK = /\s[\d,.]+ kB\b/;

export const sh = {
    // Вывод в лог: в контекст модели идёт итог и хвост ошибки,
    // а не простыня tsc / eslint / сборки
    run: (cmd, log) => new Promise(resolve => {
        const t0 = performance.now();
        const out = fs.openSync(log, 'w');
        // node_modules/.bin в PATH: typecheck зовёт tsc напрямую
        const env = {
            ...process.env, NO_COLOR: '1', FORCE_COLOR: '0',
            [PATH_KEY]: `${path.join(ROOT, 'node_modules/.bin')}${path.delimiter}${process.env[PATH_KEY]}`,
        };
        // cmd.exe съедает `^` (`HEAD^`): ревизии берите в кавычки
        const child = spawn(cmd, { cwd: ROOT, shell: true, stdio: ['ignore', out, out], env });
        // 'error' бывает вместе с 'close': лог закрываем один раз
        let closed = false;
        const done = code => {
            if (closed) return;
            closed = true;
            fs.closeSync(out);
            resolve({ ok: code === 0, code, ms: performance.now() - t0, log });
        };
        child.on('close', done);
        child.on('error', e => { if (!closed) fs.writeSync(out, String(e)); done(-1); });
    }),
    // лог без цвета и предупреждений окружения - для модели
    text: log => fs.readFileSync(log, 'utf8').replace(ANSI, '').split(/\r?\n/).filter(l => !NODE_WARN.test(l)).join('\n').trimEnd(),
    // хвост - причина провала: пустые строки и vite-чанки
    // только вытесняют её из окна
    tail: (log, n = 30) => sh.text(log).split('\n').filter(l => l.trim() && !VITE_CHUNK.test(l)).slice(-n),
};

// -- самопроверка парсера импортов

// [что, текст, [spec, kind, признаки через +, привязки]]
// `a as b` - { name, as }; `*` - весь модуль
const SPEC_CASES = [
    ['многострочный импорт', "import {\n    a,\n    b as c,\n} from './x'", [['./x', 'import', '', 'a, b as c']]],
    ['import type', "import type { A } from './x'", [['./x', 'import', 'type', 'A']]],
    ['import type, default и namespace', "import type X from './x'\nimport type * as ns from './y'", [['./x', 'import', 'type', '* as X'], ['./y', 'import', 'type', '* as ns']]],
    ['import { type X } - рантайм-импорт', "import { type X } from './x'", [['./x', 'import', '', 'X']]],
    ['import { type X as Y }', "import { type X as Y, z } from './x'", [['./x', 'import', '', 'X as Y, z']]],
    ['{ type } и { type as foo } - имя type', "import { type } from './a'\nimport { type as foo } from './b'", [['./a', 'import', '', 'type'], ['./b', 'import', '', 'type as foo']]],
    ['import type from - default с именем type', "import type from './x'", [['./x', 'import', '', '* as type']]],
    ['import type, { a } - default с именем type', "import type, { a } from './x'", [['./x', 'import', '', '* as type, a']]],
    ['export type * from', "export type * from './x'", [['./x', 'import', 'type+reexport', '*']]],
    ['export type { A } from', "export type { A } from './x'", [['./x', 'import', 'type+reexport', 'A']]],
    ['export * from', "export * from './x'", [['./x', 'import', 'reexport', '*']]],
    ['export * as ns from', "export * as ns from './x'", [['./x', 'import', 'reexport', '* as ns']]],
    ['export { a as b } from', "export { a as b, c } from './x'", [['./x', 'import', 'reexport', 'a as b, c']]],
    ['export { default } from', "export { default } from './a'\nexport { default as X } from './b'", [['./a', 'import', 'reexport', 'default'], ['./b', 'import', 'reexport', 'default as X']]],
    ['import X, { a }', "import X, { a } from './x'", [['./x', 'import', '', '* as X, a']]],
    ['import X, * as ns', "import X, * as ns from './x'", [['./x', 'import', '', '* as X, * as ns']]],
    ['import * as ns', "import * as ns from './x'", [['./x', 'import', '', '* as ns']]],
    ['import { default as X }', "import { default as X } from './x'", [['./x', 'import', '', 'default as X']]],
    ['side-effect', "import './x'", [['./x', 'import', '', '']]],
    ['import()', "const m = await import('./x')", [['./x', 'import', '', '*']]],
    ['комментарий между именами', "import { a, /* b from './no' */ c } from './x'\nimport {\n    d, // e from './no'\n    f,\n} from './y'", [['./x', 'import', '', 'a, c'], ['./y', 'import', '', 'd, f']]],
    ['BOM в начале файла', "\uFEFFimport type { A } from './x'", [['./x', 'import', 'type', 'A']]],
    ['BOM и export *', "\uFEFFexport * from './x'", [['./x', 'import', 'reexport', '*']]],
    ['type не просачивается в соседний импорт', "import type { A } from './a'\nimport { b } from './b'", [['./a', 'import', 'type', 'A'], ['./b', 'import', '', 'b']]],
    ['export без from перед import - берётся import', "export { a }\nimport b from './y'", [['./y', 'import', '', '* as b']]],
    ['vi.mock и declare module - без привязок', "vi.mock('./x')\ndeclare module 'y'", [['./x', 'mock', '', ''], ['y', 'declare', '', '']]],
    ['import внутри многострочного template - не оператор', "const s = `\nimport { a } from './no'\nexport * from './no2'\nconst m = import('./no3')\n`\nimport { b } from './yes'", [['./yes', 'import', '', 'b']]],
    ['обратная кавычка в regex-литерале не открывает template', "const W = /^a `b/\nimport { a } from './x'\nconst s = `y`", [['./x', 'import', '', 'a']]],
    ['кавычки и ${} внутри template', "const s = `it's ${\"import './no'\"}`\nimport './yes'", [['./yes', 'import', '', '']]],
];

// [что, спецификатор, импортёр, файлы, ожидание: путь|null]
const RESOLVE_CASES = [
    ['.js -> .ts', '../utils/encryption.js', 'app/services/a.ts', ['app/utils/encryption.ts'], 'app/utils/encryption.ts'],
    ['.js -> .tsx', './Copy.js', 'src/ui/a.ts', ['src/ui/Copy.tsx'], 'src/ui/Copy.tsx'],
    ['.js: .ts раньше .tsx и самого .js', './a.js', 'src/b.ts', ['src/a.js', 'src/a.tsx', 'src/a.ts'], 'src/a.ts'],
    ['.js: сам .js, когда .ts нет', './a.js', 'src/b.ts', ['src/a.js'], 'src/a.js'],
    ['.js не подбирает index', './a.js', 'src/b.ts', ['src/a.js/index.ts'], null],
    ['.ts в спецификаторе - как есть', './a.ts', 'src/b.ts', ['src/a.ts'], 'src/a.ts'],
    ['без расширения: файл раньше каталога', './a', 'src/b.ts', ['src/a/index.ts', 'src/a.ts'], 'src/a.ts'],
    ['без расширения: каталог, когда файла нет', './a', 'src/b.ts', ['src/a/index.tsx'], 'src/a/index.tsx'],
    ['`.` - index своего каталога, не соседний файл', '.', 'src/a/b.ts', ['src/a.ts', 'src/a/index.ts'], 'src/a/index.ts'],
    ['`.` без index - null', '.', 'src/a/b.ts', ['src/a.ts'], null],
    ['`..` - index родителя', '..', 'src/a/b/c.ts', ['src/a.ts', 'src/a/index.tsx'], 'src/a/index.tsx'],
    ['`./` на конце - каталог', './d/', 'src/a/b.ts', ['src/a/d.ts', 'src/a/d/index.ts'], 'src/a/d/index.ts'],
    ['`../x/..` - каталог', '../x/..', 'src/a/b/c.ts', ['src/a/index.ts'], 'src/a/index.ts'],
    ['алиас с `/` на конце - каталог', '@/a/', 'src/x.ts', ['src/a.ts', 'src/a/index.ts'], 'src/a/index.ts'],
    ['`.` в корне репозитория', '.', 'x.ts', ['index.ts'], 'index.ts'],
    ['внешний пакет', 'react', 'src/a.ts', ['react.ts'], null],
    ['json как есть', './x.json', 'src/a.ts', ['src/x.json'], 'src/x.json'],
];

// [что, текст, объявленные имена: отсортированы, через пробел]
const EXPORT_CASES = [
    ['const / let / var', 'export const a = 1;\nexport let b = 2\nexport var c', 'a b c'],
    ['function, async function, генератор', 'export function f() {}\nexport async function g() {}\nexport function* h() {}', 'f g h'],
    ['class и abstract class', 'export class K {}\nexport abstract class L {}', 'K L'],
    ['interface / type / enum / const enum / namespace', 'export interface I {}\nexport type T = 1\nexport enum E {}\nexport const enum CE {}\nexport namespace N {}', 'CE E I N T'],
    ['declare', 'export declare const D: number', 'D'],
    ['export default', 'export default function () {}', 'default'],
    ['export { a, b as c } без from', 'const a = 1, b = 2\nexport { a, b as c }', 'a c'],
    ['type-модификатор и default в списке', 'export { type d, e as default }', 'd default'],
    ['export type { U } без from', 'export type { U }', 'U'],
    ['реэкспорты и комментарии - не объявления', "export { x } from './x'\nexport * from './y'\nexport type * from './z'\n// export const hidden = 1", ''],
    ['объявление в блочном комментарии', '/*\nexport const hidden = 1\n*/\nexport const shown = 2', 'shown'],
    ['объявление внутри template - не export', 'const s = `\nexport const hidden = 1\n`\nexport const shown = 2', 'shown'],
    ['обратная кавычка в regex-литерале не открывает template', 'const W = /^a `b/;\nexport const first = 1\nconst s = `x`\nexport const second = 2', 'first second'],
    ['BOM перед первым export', '\uFEFFexport const a = 1', 'a'],
];

// [что, цель, импортёр, like, ожидание]; ответ резолвится
// обратно в цель
const SPECFOR_CASES = [
    ['алиас @/ остаётся алиасом', 'src/entities/item/transform.ts', 'src/app/a.ts', '@/entities/item/model/transform', '@/entities/item/transform'],
    ['алиас @app/', 'app/utils/b.ts', 'app/h/x.ts', '@app/utils/a', '@app/utils/b'],
    ['алиас @shared/', 'shared/types/b.ts', 'src/a.ts', '@shared/types/a', '@shared/types/b'],
    ['./ для соседей', 'src/a/b.ts', 'src/a/c.ts', './old/b', './b'],
    ['../ вверх', 'src/a/b.ts', 'src/a/d/c.ts', './x', '../b'],
    ['../ в соседний каталог', 'src/x/b.ts', 'src/a/c.ts', '../old', '../x/b'],
    ['явное расширение в алиасе', 'src/ui/Copy.tsx', 'src/a.tsx', '@/ui/copy-button.tsx', '@/ui/Copy.tsx'],
    ['явное расширение в относительной форме', 'src/a/Copy.tsx', 'src/a/c.ts', './copy-button.tsx', './Copy.tsx'],
    ['/index сохраняется', 'src/a/index.ts', 'src/x.ts', '@/b/index', '@/a/index'],
    ['цель - index.ts, like без /index: каталог', 'src/a/index.ts', 'src/x.ts', '@/b', '@/a'],
    ['цель - index.tsx, относительный: каталог', 'src/a/b/index.tsx', 'src/a/c.ts', './old', './b'],
    ['цель перестала быть index - без /index', 'src/a/b.ts', 'src/x.ts', '@/a/b/index', '@/a/b'],
    ['каталог самого импортёра', 'src/a/index.ts', 'src/a/b.ts', './old', '.'],
    ['json пишется как есть', 'package.json', 'src/shell/update/Foo.tsx', '../../../../package.json', '../../../package.json'],
    ['цель вне корня алиаса - относительный', 'shared/x.ts', 'src/a/b.ts', '@/old', '../../shared/x'],
    ['.js сохраняется: .ts-цель, относительный', 'app/utils/b.ts', 'app/services/a.ts', '../utils/a.js', '../utils/b.js'],
    ['.js сохраняется: .tsx-цель, алиас', 'src/ui/Copy.tsx', 'src/a.ts', '@/ui/copy-button.js', '@/ui/Copy.js'],
    ['.js сохраняется: цель - index.ts', 'src/a/index.ts', 'src/x.ts', './b/index.js', './a/index.js'],
    ['.js-цель остаётся .js', 'scripts/b.js', 'scripts/a.js', './old.js', './b.js'],
    ['.ts в like - цель как есть', 'src/b.ts', 'src/a.ts', './a.ts', './b.ts'],
];

const bindingText = ({ name, as }) => as === undefined || as === name ? name : `${name} as ${as}`;
const specRow = s => [s.spec, s.kind, [s.type && 'type', s.reexport && 'reexport'].filter(Boolean).join('+'), s.names.map(bindingText).join(', ')];

function selftest() {
    let bad = 0;
    const fail = (what, want, got) => { console.error(`FAIL ${what}\n  ожидалось ${JSON.stringify(want)}\n  получено  ${JSON.stringify(got)}`); bad++; };
    for (const [what, text, want] of SPEC_CASES) {
        const found = imports.specs(text);
        const got = found.map(specRow);
        if (JSON.stringify(got) !== JSON.stringify(want)) fail(what, want, got);
        if (found.some(s => text.slice(s.at, s.at + s.spec.length) !== s.spec)) fail(`${what}: at указывает не на спецификатор`, '', found.map(s => s.at));
    }
    for (const [what, text, want] of EXPORT_CASES) {
        const got = [...imports.exported(text)].sort().join(' ');
        if (got !== want) fail(what, want, got);
    }
    for (const [what, spec, from, files, want] of RESOLVE_CASES) {
        const got = imports.resolve(spec, from, new Set(files));
        if (got !== want) fail(what, want, got);
    }
    for (const [what, target, importer, like, want] of SPECFOR_CASES) {
        const got = imports.specFor(target, importer, like);
        if (got !== want) fail(what, want, got);
        else if (imports.resolve(got, importer, new Set([target])) !== target) fail(`${what}: ${got} не резолвится в цель`, target, null);
    }
    console.log(bad ? `SELFTEST: ${bad} провалов` : `SELFTEST: ok, ${SPEC_CASES.length + EXPORT_CASES.length + RESOLVE_CASES.length + SPECFOR_CASES.length} случаев`);
    return bad ? 1 : 0;
}

// точка входа - именно этот файл: `xlib.mjs` тоже
// оканчивается на `lib.mjs`
if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) process.exit(selftest());
