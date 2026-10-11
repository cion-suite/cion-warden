// Где объявлен символ: файл, строка, сигнатура. Read-only, на диске ничего не оставляет.
//   node .claude/scripts/map.mjs <symbol> [symbol...]   - объявления, члены namespace, ре-экспорты
//
// Дешёвая замена слепому grep при DRY-проверке "есть ли уже такая утилита" (CLAUDE.md -> Code Rules).
// Индекс не хранится и не синхронизируется: полный скан репозитория ~0.2 s, устареть нечему.
// Строковые константы (имена IPC-каналов, событий) сюда не попадают - это Grep.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, repo, die } from './lib.mjs';

const CODE_EXT = /\.(ts|tsx|js|mjs)$/;
const CAP = 40;
const ORDER = { decl: 0, member: 1, reexport: 2 };

// `emit.entityUpdated` -> ищем `entityUpdated`
const queries = process.argv.slice(2).map(a => a.split('.').pop()).filter(Boolean);
if (!queries.length) die('использование: map.mjs <symbol> [symbol...]');

// Core слинкован (`link:`), в git его нет - ищем и в нём
const CORE = 'node_modules/@cion-suite/core/src';
const coreFiles = () => {
    try {
        return fs.readdirSync(path.join(ROOT, CORE), { recursive: true }).map(f => `${CORE}/${String(f).replaceAll('\\', '/')}`);
    } catch { return []; }   // core не слинкован - ищем только по репозиторию
};

// untracked тоже: DRY-проверка нужнее всего на свежем коде
const files = [...repo.files(), ...coreFiles()].filter(f => CODE_EXT.test(f));

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Метод класса начинается с модификаторов:
// `async getOrInitialize(...)`, `private static readonly x: T`
const MODIFIERS = 'public|private|protected|static|readonly|override|abstract|async|get|set';

const patterns = (body, flags) => [
    // `type X,` / `type X }` - строка import, а не алиас:
    // у объявления после имени идёт `=` или `<`
    ['decl', new RegExp(`^\\s*(?:export\\s+)?(?:default\\s+)?(?:declare\\s+)?(?:async\\s+)?(?:(?:const|let|var|function\\*?|class|interface|enum)\\s+${body}\\b|type\\s+${body}\\b(?!\\s*(?:[,}]|as\\s|$)))`, flags)],
    // Отступ => поле/метод; `(?!...)` отсекает вызовы:
    // `useDbSync();`, `useEffect(() => {` - у метода так нет
    ['member', new RegExp(`^\\s+(?:(?:${MODIFIERS})\\s+)*${body}\\s*(?:[?!]?\\s*[:<]|\\((?!\\s*['"\`(])(?![^)]*\\)\\s*;?\\s*$))`, flags)],
    ['reexport', new RegExp(`^\\s*export\\s+(?:\\*\\s+as\\s+${body}\\b|\\{[^}]*\\b${body}\\b[^}]*\\})`, flags)],
];

const scan = (names, exact) => {
    const specs = names.map(q => ({
        q,
        pats: patterns(exact ? `(${esc(q)})` : `\\w*(${esc(q)})\\w*`, exact ? '' : 'i'),
        seek: new RegExp(esc(q), exact ? '' : 'i'),
    }));
    const hits = [];
    for (const f of files) {
        const text = repo.read(f);
        const live = specs.filter(s => s.seek.test(text));   // отсев целым файлом дешевле построчных регексов
        if (!live.length) continue;
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            for (const s of live) {
                const hit = s.pats.find(([, re]) => re.test(lines[i]));
                if (hit) { hits.push({ f, n: i + 1, q: s.q, kind: hit[0], sig: lines[i].trim().slice(0, 110), loose: !exact }); break; }
            }
        }
    }
    return hits;
};

// Откат на подстроку - по каждому имени: точная находка
// одного не должна отменять поиск остальных
const hits = scan(queries, true);
const loose = queries.filter(q => !hits.some(h => h.q === q));
if (loose.length) hits.push(...scan(loose, false));
const absent = queries.filter(q => !hits.some(h => h.q === q));

hits.sort((a, b) => a.loose - b.loose || ORDER[a.kind] - ORDER[b.kind] || a.f.localeCompare(b.f) || a.n - b.n);

const shown = hits.slice(0, CAP);
const width = Math.max(...shown.map(h => `${h.f}:${h.n}`.length));
shown.forEach((h, i) => {
    if (h.loose && !shown[i - 1]?.loose) {
        console.log(`${i ? '\n' : ''}  точных совпадений нет для ${loose.filter(q => !absent.includes(q)).join(', ')} - подстрока, без учёта регистра\n`);
    }
    console.log(`  ${`${h.f}:${h.n}`.padEnd(width)}  ${h.kind.padEnd(8)} ${h.sig}`);
});
if (hits.length > CAP) console.log(`  ...ещё ${hits.length - CAP} не показано`);
if (absent.length) {
    console.log(`${hits.length ? '\n' : ''}  не объявлено: ${absent.join(', ')}`);
    console.log("  строковая константа (IPC-канал, имя события) объявлением не считается - ищи Grep'ом");
}

const count = k => hits.filter(h => h.kind === k).length;
console.log(`\nDECL=${count('decl')} MEMBER=${count('member')} REEXPORT=${count('reexport')} EXACT=${loose.length ? 'no' : 'yes'}`);
