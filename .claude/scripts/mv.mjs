// Кодмод переноса файлов: git mv и перепись спецификаторов (в том числе vi.mock). Без --apply ничего не пишет.
//   node .claude/scripts/mv.mjs <map.json> [--apply] [--edits]   - --edits: построчный список правок
//   карта {"moves": [[old, new], ...], "deletes": [old, ...]}, пути от корня репозитория через /
// Отказ, коллизия или заслонение - выход 1, --apply не применяет ничего.
// Удаляемый барель: импорт по имени идёт к файлу-источнику, если он один; иначе отказ со списком имён.
// Комментарии с путями не правятся - искать grep'ом.
import fs from 'node:fs';
import path from 'node:path';
import { git, repo, imports, die, ROOT } from './lib.mjs';

const args = process.argv.slice(2);
const mapFile = args.find(a => !a.startsWith('--'));
if (!mapFile) die('использование: mv.mjs <map.json> [--apply] [--edits]');

const norm = p => String(p).replace(/\\/g, '/');
const lc = p => p.toLowerCase();
// PowerShell 5.1 пишет UTF-8 с BOM, JSON.parse его отвергает
const mapText = fs.readFileSync(mapFile, 'utf8');
const map = JSON.parse(mapText.charCodeAt(0) === 0xFEFF ? mapText.slice(1) : mapText);
const pairs = (map.moves ?? []).map(([from, to]) => [norm(from), norm(to)]);
const move = new Map(pairs);
const drop = new Set((map.deletes ?? []).map(norm));

const known = new Set(repo.files());
const gone = new Set([...move.keys(), ...drop]);
const after = new Set([...known].filter(f => !gone.has(f)).concat([...move.values()]));
const refused = [], collisions = [], shadow = [], edits = [];

// -- карта: старые пути, коллизии, заслонение

const olds = [...pairs.map(p => p[0]), ...drop];
for (const f of olds.filter((f, i) => olds.indexOf(f) !== i)) refused.push(`${f} - в карте дважды`);
for (const f of olds.filter(f => !known.has(f))) refused.push(`${f} - нет в репозитории (опечатка в карте?)`);
const tracked = new Set(git.run('ls-files', '-z').split('\0'));
// git mv / git rm не берут untracked: отказ посреди применения
// оставил бы карту выполненной наполовину
for (const f of olds.filter(f => known.has(f) && !tracked.has(f))) refused.push(`${f} - не под git`);

// git rm идёт первым, путь удаляемого файла свободен
const present = new Set([...known].filter(f => !drop.has(f)).map(lc));
const staying = new Set([...known].filter(f => !gone.has(f)).map(lc));
const claimed = new Map();
const queue = [];
// git mv не перезаписывает, в каталог кладёт молча: назначение
// или родитель заняты не файлом репозитория - отказ
const listed = new Set([...known].map(lc));
const occupant = to => {
    for (let p = to; p !== '.'; p = path.posix.dirname(p)) {
        const stat = fs.statSync(path.join(ROOT, p), { throwIfNoEntry: false });
        if (stat && (p === to ? !listed.has(lc(p)) : !stat.isDirectory())) return p;
    }
    return null;
};
for (const [from, to] of move) {
    const busy = occupant(to);
    if (lc(from) === lc(to)) collisions.push(`${from} -> ${to} - перенос меняет только регистр имени (core.ignorecase)`);
    else if (claimed.has(lc(to))) collisions.push(`${claimed.get(lc(to))} и ${from} -> ${to} - один путь назначения`);
    else if (busy) collisions.push(`${from} -> ${to} - на диске занято ${busy}, это не файл репозитория`);
    else queue.push([from, to]);
    claimed.set(lc(to), from);
}
// git mv не перезаписывает: перенос на путь, освобождаемый
// другим переносом, идёт после него
const ordered = [];
for (let i; (i = queue.findIndex(([, to]) => !present.has(lc(to)))) >= 0;) {
    const [from, to] = queue.splice(i, 1)[0];
    present.delete(lc(from)); present.add(lc(to)); ordered.push([from, to]);
}
for (const [from, to] of queue) collisions.push(`${from} -> ${to} - ${staying.has(lc(to)) ? 'занято файлом, который не уезжает' : 'цикл переносов'}`);

// x.ts рядом с x/index.ts: резолв берёт x.ts, и барель молча
// пропадает; уже существующую пару не трогаем
const fresh = new Set(move.values());
const byStem = Map.groupBy(after, imports.stem);
for (const f of after) {
    const stem = imports.stem(f);
    if (stem === null || path.posix.basename(stem) !== 'index') continue;
    for (const over of byStem.get(path.posix.dirname(stem)) ?? []) if (fresh.has(f) || fresh.has(over)) shadow.push(`${over} заслоняет ${f}`);
}
// x.ts рядом с x.tsx: импорт без расширения берёт первый из
// SUFFIX, и не переехавший импортёр молча меняет цель
for (const [stem, group] of byStem) if (stem !== null && group.length > 1 && group.some(f => fresh.has(f))) shadow.push(`${group.join(' и ')} - один спецификатор без расширения`);

// -- удаляемые барели: куда вести импорт по имени

const own = f => imports.exported(repo.read(f));
const links = f => imports.specs(repo.read(f)).filter(s => s.kind === 'import' && s.reexport)
    .map(s => ({ names: s.names, to: imports.resolve(s.spec, f, known) })).filter(l => l.to);

// Барель с побочным импортом, relay или реэкспортом пакета при
// удалении потерял бы это молча: имя из него ведёт в отказ
const impure = f => imports.specs(repo.read(f)).some(s => s.kind === 'import' && (!s.reexport || !imports.resolve(s.spec, f, known)));

// Файл, у которого барель берёт имя: сквозь удаляемые
// барели - до первого оставшегося файла
const origin = (file, name, trail = []) => {
    if (drop.has(file) && impure(file)) return null;
    if (own(file).has(name)) return file;
    if (trail.includes(file)) return null;
    for (const l of links(file)) {
        for (const e of l.names) {
            // переименование (`a as b`) правкой спецификатора не передать
            if (e.name !== e.as || (e.as !== name && !(e.as === '*' && name !== 'default'))) continue;
            // имя из `export *` уцелевший файл обязан отдавать,
            // иначе оно из другого реэкспорта
            const deeper = !drop.has(l.to) && e.as !== '*' ? l.to : origin(l.to, name, [...trail, file]);
            if (deeper) return drop.has(l.to) ? deeper : l.to;
        }
    }
    return null;
};
// Источники бареля целиком: для namespace/default/import().
// Переименованный реэкспорт - null: форму модуля не сохранить
const leaves = (file, trail = []) => trail.includes(file) ? [] : impure(file) ? [null] : [
    ...own(file).size ? [file] : [],
    ...links(file).flatMap(l => l.names.some(e => e.name !== e.as) ? [null] : drop.has(l.to) ? leaves(l.to, [...trail, file]) : [l.to]),
];

// -- правки спецификаторов

const lineAt = (text, at) => text.slice(0, at).split('\n').length;
const inScope = f => /^(?:src|app|shared|tests)\//.test(f) && imports.code(f) && !drop.has(f);

for (const f of [...known].filter(inScope)) {
    const text = repo.read(f), importer = move.get(f) ?? f;
    for (const s of imports.specs(text).filter(s => s.kind !== 'declare')) {
        const target = imports.resolve(s.spec, f, known);
        if (!target) {
            if (importer !== f && s.spec.startsWith('.')) refused.push(`${f}:${lineAt(text, s.at)} - '${s.spec}' не резолвится, а файл переезжает`);
            continue;
        }
        let source = target;
        if (drop.has(target)) {
            const names = s.names.map(n => n.name).filter(n => n !== '*');
            const rows = names.map(n => [n, origin(target, n)]);
            if (names.length < s.names.length || !s.names.length) rows.push(...leaves(target).map(l => ['*', l]));
            const found = new Set(rows.map(r => r[1]));
            [source] = found;
            if (found.size !== 1 || !source || drop.has(source)) {
                refused.push(`${f}:${lineAt(text, s.at)} - барель ${target} удаляется, источник не один или в нём не только реэкспорты: ${rows.map(([n, l]) => `${n} -> ${l ?? '?'}`).join(', ') || 'реэкспортов нет'}`);
                continue;
            }
        }
        const dest = move.get(source) ?? source;
        if (importer === f && dest === target) continue;
        const next = imports.specFor(dest, importer, s.spec);
        if (imports.resolve(next, importer, after) !== dest) refused.push(`${f}:${lineAt(text, s.at)} - '${next}' не резолвится в ${dest}`);
        else if (next !== s.spec) edits.push({ file: importer, line: lineAt(text, s.at), at: s.at, from: s.spec, to: next });
    }
}

// -- сводка

const files = Map.groupBy(edits, e => e.file);
console.log(`MOVES=${move.size} DELETES=${drop.size} EDITS=${edits.length} FILES=${files.size} REFUSED=${refused.length} COLLISIONS=${collisions.length} SHADOW=${shadow.length}`);
for (const [tag, list] of [['REFUSED', refused], ['COLLISION', collisions], ['SHADOW', shadow]]) for (const l of list) console.log(`  ${tag} ${l}`);
if (args.includes('--edits')) for (const e of edits) console.log(`  ${e.file}:${e.line}  ${e.from} -> ${e.to}`);
if (refused.length + collisions.length + shadow.length) {
    if (args.includes('--apply')) console.log('  --apply не применён: сначала отказы, коллизии и заслонения');
    process.exit(1);
}

// -- применение

if (args.includes('--apply')) {
    if (drop.size) git.run('rm', '-q', '--', ...drop);
    // git mv каталоги назначения не создаёт
    for (const [from, to] of ordered) {
        fs.mkdirSync(path.dirname(path.join(ROOT, to)), { recursive: true });
        git.run('mv', from, to);
    }
    // git mv и git rm оставляют опустевшие каталоги на диске:
    // старые папки висели бы пустыми
    for (const old of olds) {
        for (let dir = path.posix.dirname(old); dir !== '.'; dir = path.posix.dirname(dir)) {
            const full = path.join(ROOT, dir);
            if (!fs.existsSync(full)) continue;
            if (fs.readdirSync(full).length) break;
            fs.rmdirSync(full);
        }
    }
    // справа налево, без нормализации текста: позиции левее правки
    // не плывут, BOM и CRLF сохраняются
    for (const [file, list] of files) {
        let text = repo.read(file);
        for (const e of list.toSorted((a, b) => b.at - a.at)) text = text.slice(0, e.at) + e.to + text.slice(e.at + e.from.length);
        fs.writeFileSync(path.join(ROOT, file), text);
    }
    console.log('применено');
}
