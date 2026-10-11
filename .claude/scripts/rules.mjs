// Правила CLAUDE.md -> Code Rules в исполняемом виде.
// Единый источник для diff-scan.mjs и plan-scan.mjs - иначе чек-листы команд разъезжаются.
// Самопроверка: node .claude/scripts/rules.mjs
//
// Не проверяем то, что уже ловит тулинг:
//   импорт против границ слоёв и сущностей -> ESLint boundaries/dependencies
//   IPC-канал в ipc-channels.ts, событие в EventMap -> declaration merging, ошибка компиляции
//   any -> ESLint @typescript-eslint/no-explicit-any
//   webContents.send, ipcRenderer.on, new BrowserWindow -> ESLint @cion-suite/core/primitives
//
// tier C (confirmed) - regex и есть истина, триаж не нужен.
// tier K (check)     - кандидат, вердикт только с контекстом файла.
//
// path: true - правило смотрит на путь файла, а не на текст строки: hit(_, файл). match() такие правила
// пропускает, их применяет matchPath (diff-scan - к добавленным и переехавшим файлам).

// ID (3.x) - ключи, не секции CLAUDE.md. Модель видит
// их в скане и в .claude/agents/triage.md - меняй и там.
// Пропуски в нумерации оставлены: номер не переиспользуется

// Объявление типа, а не спецификатор импорта:
// `import { type Foo, ... }` даёт строку `type Foo,`
const TYPE_DECL = /^\s*(?:export\s+)?(?:declare\s+)?(?:type\s+(\w+)\s*[=<]|interface\s+(\w+))/;

// "было бы" - условное наклонение, это WHY, а не история
const CONDITIONAL = /(?<!\p{L})бы(?!\p{L})/iu;

// Любой символ, кроме ASCII и кириллицы
const NON_KEYBOARD = /[^\x00-\x7F\p{Script=Cyrillic}]/u;

// Текст комментария без маркера; директивы (eslint-disable, @ts-*) лимит не касается
const COMMENT_TEXT = /^\s*(?:\/\/+|\/\*+|\{\/\*+|\*(?=\s|$)|#(?=\s)|--+(?=\s))\s?(.*?)\s*(?:\*\/\}?)?\s*$/;
const COMMENT_DIRECTIVE = /^(?:eslint-|@ts-|prettier-|istanbul|c8 )/;

// Комментарий строкой выше - WHY исключения; директива - нет
const whyAbove = prev => !COMMENT_DIRECTIVE.test(COMMENT_TEXT.exec(prev ?? '')?.[1] ?? 'eslint-');

// Суффикс - последнее слово имени: `userId` да, `isValid` нет.
// Слитные имена (`username`, `objectguid`) ловит хвост TAIL
const ID_LIKE = /^(id|count|index|len|size|num|guid|uuid|value|port|offset|limit|name)$/;
const TAIL = /(name|guid|uuid)$/;
const lastWord = name => name.split(/_|(?<=[a-z\d])(?=[A-Z])/).at(-1).toLowerCase();

// Текст строки - не код: `credentials:` в логе не ключ.
// Кавычки остаются, литерал-значение видно
const blankStrings = t => t.replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, '$1$1');

// Вызов логгера (`log.error(`, `this.log.warn(`, `logger.child('x').info(`)
// с текстом ошибки вместо неё самой - в том числе внутри объекта-аргумента
const LOG_ERROR_TEXT = /\b(?:log|logger)(?:\.child\([^)]*\))?\.(?:error|warn|info|verbose|debug|silly)\s*\(.*\bas Error\)\.message\b/;
// Шаблон не гасим: `${(e as Error).message}` - тот же текст ошибки
const blankQuotes = t => t.replace(/(['"])(?:\\.|(?!\1)[^\\])*\1/g, '$1$1');

// "Папка = вещь, имя файла = роль": роль не в папке (3.16),
// имя файла её называет (3.17)
const ROLE_DIR = /^src\/(?:entities|shell|kit)\/(?:[^/]+\/)*?(?:ui|model|api|lib|hooks|config|types|pages)\//;
const NAMED_TSX = /^(?:[A-Z][A-Za-z0-9]*|use[A-Z]\w*|index|[\w-]+-config)(?:\.test)?\.tsx$/;
const KEBAB_HOOK = /^use-[\w-]+(?:\.test)?\.tsx?$/;
// `*Page.tsx` - экран маршрута (часть сущности или оболочки).
// Шаблон окна в kit зовётся *Window
const SCREEN = /^src\/(?:entities\/[^/]+\/[^/]+|shell\/[^/]+)\/[A-Z]\w*Page\.tsx$/;
// use-mobile.ts - генерат shadcn, имя не выбирать
const SHADCN_HOOK = 'src/lib/hooks/ui/use-mobile.ts';

// Закон имён (3.31): сегмент пути - одно слово в нижнем регистре,
// подстановка `${...}` не проверяется
const VERBS = new Set(['get', 'list', 'find', 'create', 'copy', 'update', 'rename', 'move', 'delete', 'restore', 'add', 'remove', 'set', 'reset', 'toggle', 'enable', 'disable', 'unlock', 'open', 'run', 'connect', 'resolve', 'refresh', 'sync', 'import', 'install', 'request', 'clear', 'save', 'exists', 'preview', 'relaunch', 'extract', 'export']);
// Имена таблицы, не причастия: событие доступности и прогресса
const EVENT_EXTRA = new Set(['available', 'progress']);
const NAME_FILES = { 'shared/types/ipc-channels.ts': 'channel', 'shared/types/app-events.ts': 'event' };
const NAME_KEY = /^\s*'([^']+)'\s*:|\[K in `([^`]+)`\]/;
const SUBST = /^\$\{\w+\}$/;
const badName = (t, f) => {
    const kind = NAME_FILES[f];
    const m = kind && !COMMENT_TEXT.test(t) && NAME_KEY.exec(t);
    if (!m) return false;
    const segs = (m[1] ?? m[2]).split(':');
    const leaf = segs.at(-1);
    if (segs.some(s => !SUBST.test(s) && !/^[a-z]+$/.test(s))) return true;
    if (SUBST.test(leaf)) return false;
    if (kind === 'event') return !/(?:ed|ing)$/.test(leaf) && !EVENT_EXTRA.has(leaf);
    return t.includes('args:') ? !VERBS.has(leaf) : VERBS.has(leaf);
};

// Однострочный `import { ... } from 'lucide-react'` (не `import type`);
// многострочный блок построчно не виден
const LUCIDE_IMPORT = /^\s*import\s+(?!type\b)\{([^}]*)\}\s*from\s*['"]lucide-react['"]/;
const lucideNoSuffix = t => (LUCIDE_IMPORT.exec(t)?.[1] ?? '').split(',')
    .map(s => s.trim()).filter(s => s && !s.startsWith('type '))
    .some(s => !s.split(/\s+as\s+/)[0].endsWith('Icon'));

// Домашние файлы уровней хранения: фабрику ядра зовёт только он
const STORE_HOME = /^src\/lib\/state\.ts$/;

// `errors.fail/wrap` возвращает ошибку: бросает call-site.
// Позиция оператора - перед вызовом начало оператора, а не `throw` / `=` / аргумент
const ERROR_CALL = /\berrors\.(?:fail|wrap)\(/g;
const STATEMENT_START = /(?:[;{})]|\belse|&&|\|\||(?:^|[;{}]\s*)(?:case\b[^:]*|default\s*):)$/;
const CASE_LABEL = /^\s*(?:case\b.*|default\s*):\s*$/;
// Продолжение выражения: вызов - его часть, `:` метки case не считается
const CONTINUES = /(?:[(,=?]|=>|\bthrow|\breturn)$/;
const stripLine = t => blankStrings(t).replace(/\/\/.*$/, '').trimEnd();
const droppedError = (text, prev) => {
    if (COMMENT_TEXT.test(text)) return false;
    const code = stripLine(text);
    return [...code.matchAll(ERROR_CALL)].some(m => {
        const before = code.slice(0, m.index).trimEnd().replace(/\bvoid$/, '').trimEnd();
        if (before) return STATEMENT_START.test(before);
        // Строка выше - комментарий: контекста нет, молчим
        if (prev && COMMENT_TEXT.test(prev)) return false;
        const above = stripLine(prev ?? '');
        return !CONTINUES.test(above) && !(above.endsWith(':') && !CASE_LABEL.test(above));
    });
};

export const RULES = [
    {
        id: '3.8', sev: '🟡', tier: 'C', name: 'useMemo/useCallback (React 19 Compiler мемоизирует сам; исключение с WHY - хук не компилируется, либо функция - зависимость эффекта: exhaustive-deps не видит мемоизацию компилятора)',
        hit: (t, f, prev) => /\.tsx?$/.test(f) && /\b(useMemo|useCallback)\s*\(/.test(t) && !whyAbove(prev),
    },
    {
        id: '3.4', sev: '🔴', tier: 'C', name: '__dirname вместо app/utils/paths.ts',
        hit: (t, f) => /__dirname/.test(t) && f.startsWith('app/') && !f.endsWith('app/utils/paths.ts'),
    },
    {
        // Законные срабатывания (поэтому K): inline-экран результата,
        // throw в редактор, перечитывание кеша, `safeParse().success`
        id: '3.15', sev: '🟡', tier: 'K', name: 'ручная ветка .success вокруг операции (toast.result показывает исход сам)',
        hit: (t, f) => f.startsWith('src/') && f !== 'src/ui/toast.ts' && /\b(?!toast\b)\w+\??\.success\b/.test(t),
    },
    {
        // ponytail: имя переменной - прокси для типа. Пропустит
        // `if (!qty)`; сузить - только через ts-парсер
        id: '3.1', sev: '🔴', tier: 'K', name: 'falsy-guard на id/числе/строке (0 валиден; пустую строку на границе отвергает z.string().min(1))',
        hit: t => [...t.matchAll(/\bif\s*\(\s*!(?:\w+\.)*(\w+)\s*\)/g)].some(m => ID_LIKE.test(lastWord(m[1])) || TAIL.test(lastWord(m[1]))),
    },
    {
        id: '3.3', sev: '🔴', tier: 'K', name: 'handler возвращает {error} вместо throw',
        hit: (t, f) => f.startsWith('app/') && /return\s*\{[^}]*\berror\b/.test(t),
    },
    {
        // Фикстуры тестов - фейковые секреты;
        // `credentials: 'include'` - опция fetch
        id: '3.5', sev: '🔴', tier: 'K', name: 'credentials мимо vault',
        hit: (t, f) => !/\.test\./.test(f)
            && /(password|secret|token|apikey|credential)\w*\s*[:=]\s*['"`]/i.test(blankStrings(t))
            && !/\bvault\./.test(t)
            && !/\bcredentials\s*:\s*['"](include|same-origin|omit)['"]/.test(t)
            && !/^\s*(export\s+)?type\s+\w+/.test(t),
    },
    {
        // Props одного компонента живут рядом с ним
        id: '3.6', sev: '🟡', tier: 'K', name: 'inline interface/type в .tsx',
        hit: (t, f) => {
            const m = f.endsWith('.tsx') && t.match(TYPE_DECL);
            return !!m && !/props$/i.test(m[1] ?? m[2]);
        },
    },
    {
        id: '3.11', sev: '🟡', tier: 'K', name: 'нарративный комментарий (история живёт в commit)',
        hit: t => /^\s*(\/\/|\*|#)/.test(t) && (
            /(раньше|ранее|добавлено|убрано|fix #|TASK-|используется в|теперь)/i.test(t)
            || (/(было|стало)/i.test(t) && !CONDITIONAL.test(t))),
    },
    {
        id: '3.18', sev: '🟡', tier: 'C', name: 'комментарий: строка текста длиннее 60 символов (лимит - 2 строки по 60)',
        // Шапки .claude/scripts - многострочный usage, лимит их не касается
        hit: (t, f) => {
            const text = !f.startsWith('.claude/') && COMMENT_TEXT.exec(t)?.[1];
            return !!text && text.length > 60 && !COMMENT_DIRECTIVE.test(text);
        },
    },
    {
        id: '3.29', sev: '🟡', tier: 'C', name: 'комментарий: символ не с клавиатуры (стрелка, длинное тире, box-drawing) - только ASCII и кириллица: ->, -, --',
        hit: t => NON_KEYBOARD.test(COMMENT_TEXT.exec(t)?.[1] ?? ''),
    },
    {
        // Запись канала - одна строка: по 'args:' ее не отличить от значения
        id: '3.31', sev: '🟡', tier: 'C', name: 'имя канала / события / значения IpcValueMap против закона имён (сегмент - слово a-z; лист канала - глагол словаря, события - причастие, значения - не глагол)',
        hit: badName,
    },
    {
        // Код нужен catch-стороне и логу: без него stack на каждый отказ.
        // В renderer new Error законен для багов (useX вне Provider)
        id: '3.21', sev: '🔴', tier: 'C', name: 'new Error( в app/ - errors.fail(code, msg, { cause })',
        hit: (t, f) => f.startsWith('app/') && !/\.test\./.test(f)
            && !COMMENT_TEXT.test(t) && /\bnew Error\(/.test(blankStrings(t)),
    },
    {
        id: '3.22', sev: '🔴', tier: 'C', name: 'executeJavaScript( в app/ - splash - Splash.update ядра',
        hit: (t, f) => f.startsWith('app/') && !/\.test\./.test(f)
            && !COMMENT_TEXT.test(t) && /\bexecuteJavaScript\(/.test(blankStrings(t)),
    },
    {
        // `storage: localStorage` (передача объекта библиотеке) - не вызов
        id: '3.23', sev: '🔴', tier: 'C', name: 'localStorage/sessionStorage мимо state - `state` (src/lib/state.ts)',
        hit: (t, f) => f.startsWith('src/') && !/\.test\./.test(f) && !COMMENT_TEXT.test(t)
            && !STORE_HOME.test(f) && /\b(?:local|session)Storage\.(?:getItem|setItem|removeItem|clear)\s*\(/.test(blankStrings(t)),
    },
    {
        // `.create<T>(` и `.create(`: дженерик у фабрик необязателен.
        // Один экземпляр на окно / процесс - у каждого свой кеш
        id: '3.24', sev: '🔴', tier: 'C', name: 'фабрика renderer state (`state.create(`) - только в домашнем файле уровня (docs/architecture.md § Уровни хранения)',
        hit: (t, f) => /^(?:app|src)\//.test(f) && !STORE_HOME.test(f) && !/\.test\./.test(f)
            && !COMMENT_TEXT.test(t) && /\b(?:state|coreState)\.create\s*[<(]/.test(blankStrings(t)),
    },
    {
        // lucide отдаёт каждую иконку и как `Users`, и как `UsersIcon`:
        // имя без суффикса сталкивается с типами и компонентами сущностей
        id: '3.25', sev: '🟡', tier: 'C', name: 'lucide - имя иконки с суффиксом Icon (`SearchIcon`, не `Search`, не `Search as SearchIcon`)',
        hit: t => lucideNoSuffix(t),
    },
    {
        // errors.fail возвращает ошибку, не бросает: без throw валидация - no-op
        id: '3.26', sev: '🔴', tier: 'C', name: 'errors.fail/wrap без throw (ошибка в позиции оператора, значение теряется - `throw errors.fail(...)`)',
        hit: (t, f, prev) => /^(?:app|src|shared)\//.test(f) && !/\.test\./.test(f) && droppedError(t, prev),
    },
    {
        id: '3.27', sev: '🟡', tier: 'C', name: '(e as Error).message - errors.explain(e).message (снимает префикс Electron и маркер кода) или e целиком в log',
        hit: (t, f) => /^(?:app|src|shared)\//.test(f) && !COMMENT_TEXT.test(t) && /\bas Error\)\.message\b/.test(blankStrings(t)),
    },
    {
        // Логгер сам решает про stack и код - по объекту ошибки;
        // вложенный { error } он не рендерит
        id: '3.28', sev: '🔴', tier: 'C', name: '(e as Error).message в аргументе log.* / logger.* - передай ошибку целиком: log.error(\'...\', e, { ctx })',
        hit: (t, f) => /^(?:app|src|shared)\//.test(f) && !COMMENT_TEXT.test(t) && LOG_ERROR_TEXT.test(blankQuotes(t)),
    },
    {
        id: '3.16', sev: '🔴', tier: 'C', path: true, name: 'папка-роль в entities/shell/kit (внутри части плоско, роль - в имени файла)',
        hit: (_, f) => ROLE_DIR.test(f),
    },
    {
        // Законный kebab `.tsx` (поэтому K): фабрики и конфиги с JSX,
        // ui/markdown/components.tsx
        id: '3.17', sev: '🟡', tier: 'K', path: true, name: 'имя не называет роль (компонент - PascalCase.tsx, хук - useX; `*Page.tsx` - только экран)',
        hit: (_, f) => {
            const name = f.slice(f.lastIndexOf('/') + 1);
            const component = /^src\/(?:entities|shell|kit|ui)\//.test(f) && f.endsWith('.tsx') && !NAMED_TSX.test(name);
            const strayPage = f.startsWith('src/') && name.endsWith('Page.tsx') && !SCREEN.test(f);
            return component || strayPage || (f.startsWith('src/') && f !== SHADCN_HOOK && KEBAB_HOOK.test(name));
        },
    },
];

// На .md правила бьют по документам, цитирующим запрещённое,
// чтобы его запретить: гейт по расширению общий
const CODE = /\.(ts|tsx|js|mjs)$/;

// `CASES` - нарушающий код по построению, shadcn - вендорный:
// иначе каждый новый компонент давал бы ложный CONFIRMED
const SKIP = /(^|\/)\.claude\/scripts\/rules\.mjs$|^src\/ui\/shadcn\//;

const applies = file => CODE.test(file) && !SKIP.test(file);

// Единственная точка применения текстовых правил;
// prev - ближайшая непустая строка выше
export const match = (text, file, prev) => applies(file) ? RULES.filter(r => !r.path && r.hit(text, file, prev)) : [];

// По пути - только внесённое; from - путь до переименования.
// Перенос нарушающего пути на нарушающий - не новое нарушение
export const matchPath = (file, from) => {
    const hits = f => applies(f) ? RULES.filter(r => r.path && r.hit('', f)) : [];
    const old = new Set(from ? hits(from).map(r => r.id) : []);
    return hits(file).filter(r => !old.has(r.id));
};
// Нарушающие символы собираем из кодов: исходник самого правила остаётся ASCII
const ARROW = String.fromCharCode(0x2192);
const DASH = String.fromCharCode(0x2500);
const EMDASH = String.fromCharCode(0x2014);


// [id, файл, нарушение, норма, файл нормы?] - файл нормы для
// исключений по пути; у path: true строки пустые
export const CASES = [
    ['3.8', 'src/a.tsx', 'const x = useMemo(() => 1, [])', 'const x = memo(Foo)'],
    ['3.8', 'src/a.tsx', 'const x = useMemo(() => 1, [])', 'const x = useMemo(() => 1, [])', 'src/ui/shadcn/a.tsx'],
    ['3.8', 'src/a.tsx', '// eslint-disable-next-line react-hooks/exhaustive-deps\nconst f = useCallback(() => 1, [])', '// зависимость эффекта: exhaustive-deps\nconst f = useCallback(() => 1, [])'],
    ['3.4', 'app/x.ts', 'path.join(__dirname, "s.html")', 'path.join(paths.resources(), "s.html")'],
    ['3.15', 'src/entities/item/A.tsx', 'if (result?.success) {', 'toast.success(`Готово`)'],
    ['3.15', 'src/entities/item/A.tsx', 'const failed = results.filter(r => !r.success);', 'const ok = await toast.result(op, { error })'],
    ['3.15', 'src/entities/item/A.tsx', 'if (result.success) {', 'if (result.success) {', 'src/ui/toast.ts'],
    ['3.1', 'app/x.ts', 'if (!userId) return null', 'if (!user) return null'],
    ['3.1', 'app/x.ts', 'if (!fileName) {', 'if (!passwordValidation.isValid) {'],
    ['3.1', 'app/x.ts', 'if (!row.user_id) continue', 'if (!isExport) return'],
    ['3.1', 'app/x.ts', 'if (!ok) return; if (!id) return', 'if (!ok) return; if (!user) return'],
    ['3.1', 'app/x.ts', 'if (!username) return', 'if (!persist) return'],
    ['3.3', 'app/updater/x.ts', 'return { error: e.message }', 'throw errors.fail("failed", "x")'],
    ['3.5', 'app/x.ts', 'const password = "hunter2"', 'const password = vault.get("token")'],
    ['3.5', 'app/x.ts', 'const password = "hunter2"', 'const password = "hunter2"', 'tests/app/x.test.ts'],
    ['3.5', 'app/x.ts', "credentials: 'hunter2',", "credentials: 'include',"],
    ['3.5', 'app/x.ts', "token = 'abc'", "export type TokenKind = 'jwt' | 'basic'"],
    ['3.5', 'app/x.ts', "adminPassword: 'abc123',", 'log.error(`Ошибка получения ${source} credentials:`, message)'],
    ['3.6', 'src/a.tsx', 'interface Entry { id: number }', 'const Entry = 1'],
    ['3.6', 'src/a.tsx', 'type Row = { id: number }', 'interface RowProps { id: number }'],
    ['3.6', 'src/a.tsx', 'export type Pair<T> = [T, T]', 'type ButtonProps = { id: number }'],
    ['3.6', 'src/a.tsx', 'interface PickerMeta {', 'interface PickerMetaProps {'],
    ['3.6', 'src/a.tsx', 'type Row = { id: number }', '    type ColumnDef,'],
    ['3.11', 'app/x.ts', '// раньше тут был fallback на null', '// WHY: порт 0 валиден'],
    ['3.11', 'app/x.ts', '// было два вызова, стало один', '// без guard было бы 4 процесса'],
    ['3.18', 'app/x.ts', `// ${'в'.repeat(61)}`, `// ${'в'.repeat(60)}`],
    ['3.18', 'src/a.tsx', `{/* ${'в'.repeat(61)} */}`, '// eslint-disable-next-line ' + 'в'.repeat(60)],
    ['3.29', 'app/x.ts', `// a ${ARROW} b`, '// a -> b'],
    ['3.29', 'src/a.tsx', `{/* ${DASH}${DASH} Секция */}`, '{/* -- Секция */}'],
    ['3.29', 'app/x.ts', `// a ${EMDASH} b`, `const arrow = '${ARROW}'`],
    ['3.21', 'app/updater/x.ts', "throw new Error('Не указано имя')", "throw errors.fail('validation', 'Не указано имя')"],
    ['3.21', 'app/updater/x.ts', "reject(new Error('timeout'))", "// вместо new Error( - errors.fail"],
    ['3.21', 'app/x.ts', "throw new Error('x')", "throw new Error('x')", 'tests/app/x.test.ts'],
    ['3.21', 'app/x.ts', "throw new Error('x')", "throw new Error('x')", 'src/a.ts'],
    ['3.21', 'app/x.ts', "throw new Error('x')", "log.info('new Error( запрещён')"],
    ['3.22', 'app/x.ts', 'win.webContents.executeJavaScript(code)', 'Splash.update(splash, { text })'],
    ['3.22', 'app/x.ts', 'win.webContents.executeJavaScript(code)', '// executeJavaScript( запрещён'],
    ['3.22', 'app/x.ts', 'win.webContents.executeJavaScript(code)', 'win.webContents.executeJavaScript(code)', 'tests/app/x.test.ts'],
    ['3.22', 'app/x.ts', 'win.webContents.executeJavaScript(code)', 'win.webContents.executeJavaScript(code)', 'src/a.ts'],
    ['3.22', 'app/x.ts', 'win.webContents.executeJavaScript(code)', "log.info('executeJavaScript( запрещён')"],
    ['3.23', 'src/a.tsx', "const v = localStorage.getItem('k')", "const v = state.get('lastRoute')"],
    ['3.23', 'src/a.tsx', "sessionStorage.setItem('k', '1')", "useDefaultLayout({ id: 'x', storage: localStorage })"],
    ['3.23', 'src/a.tsx', 'window.localStorage.removeItem(key)', '// localStorage.clear() запрещён'],
    ['3.23', 'src/a.tsx', "localStorage.getItem('k')", "localStorage.getItem('k')", 'src/lib/state.ts'],
    ['3.23', 'src/a.tsx', "localStorage.getItem('k')", "localStorage.getItem('k')", 'tests/src/a.test.ts'],
    ['3.23', 'src/a.tsx', "localStorage.getItem('k')", "localStorage.getItem('k')", 'app/a.ts'],
    ['3.23', 'src/a.tsx', "localStorage.getItem('k')", "log.info('localStorage.getItem( запрещён')"],
    ['3.24', 'app/x.ts', 'const s = coreState.create<UiState>({ defaults })', 'const s = state.get("lastRoute")'],
    ['3.24', 'src/a.ts', 'const s = state.create({ defaults, storage: "session" })', 'const s = settings.get("theme")'],
    ['3.24', 'app/x.ts', 'const s = coreState.create({ defaults })', "const s = windows.create({ id })"],
    ['3.24', 'src/a.ts', 'export const s = state.create<UiState>({ defaults })', 'export const s = coreState.create<UiState>({ defaults })', 'src/lib/state.ts'],
    ['3.24', 'app/x.ts', 'const v = coreState.create({ defaults })', 'const v = coreState.create({ defaults })', 'tests/app/x.test.ts'],
    ['3.24', 'app/x.ts', 'const v = coreState.create({ defaults })', '// coreState.create( запрещён'],
    ['3.24', 'app/x.ts', 'const v = coreState.create({ defaults })', "log.info('coreState.create( запрещён')"],
    ['3.24', 'app/x.ts', 'const v = coreState.create({ defaults })', 'const v = coreState.create({ defaults })', 'shared/x.ts'],
    ['3.25', 'src/a.tsx', "import { Settings, FolderOpen } from 'lucide-react'", "import { SettingsIcon, FolderOpenIcon } from 'lucide-react'"],
    ['3.25', 'src/a.tsx', "import { Search as SearchIcon } from 'lucide-react'", "import { SearchIcon } from 'lucide-react'"],
    ['3.25', 'src/a.tsx', "import { type LucideIcon, Settings } from 'lucide-react'", "import { type LucideIcon, SettingsIcon } from 'lucide-react'"],
    ['3.25', 'src/a.tsx', "import { SettingsIcon, Home } from \"lucide-react\"", "import type { LucideIcon } from 'lucide-react'"],
    ['3.25', 'src/a.tsx', "import { Settings } from 'lucide-react'", "import { Settings } from './settings'"],
    ['3.25', 'src/a.tsx', "import { Settings } from 'lucide-react'", "import { Settings } from 'lucide-react'", 'src/ui/shadcn/a.tsx'],
    ['3.26', 'app/x.ts', "errors.fail('validation', 'x')", "throw errors.fail('validation', 'x')"],
    ['3.26', 'app/x.ts', "if (!x) errors.fail('validation', 'x')", "reject(errors.fail('timeout', 't'))"],
    ['3.26', 'app/x.ts', "ok && errors.fail('x', 'y')", "const e = errors.wrap(cause, 'y')"],
    ['3.26', 'app/x.ts', "} else errors.fail('x', 'y')", "return errors.fail('x', 'y')"],
    ['3.26', 'app/x.ts', "if (a) void errors.wrap(e, 'x')", "const run = () => errors.fail('x', 'y')"],
    ['3.26', 'app/x.ts', "case 'a':\nerrors.fail('x', 'y')", "return Promise.reject(\nerrors.fail('timeout', 't'))"],
    ['3.26', 'app/x.ts', "if (!x)\nerrors.fail('x', 'y')", ".catch(e =>\nerrors.fail('x', 'y'))"],
    ['3.26', 'app/x.ts', "case 'a': errors.fail('x', 'y')", "const e = ok\n? errors.fail('x', 'y')"],
    ['3.26', 'app/x.ts', "foo()\nerrors.fail('x', 'y')", "const e = ok ?\nerrors.fail('x', 'y')"],
    ['3.26', 'app/x.ts', "errors.fail('x', 'y')", '// errors.fail( без throw'],
    ['3.26', 'app/x.ts', "errors.fail('x', 'y')", "log.info('errors.fail( без throw')"],
    ['3.26', 'app/x.ts', "errors.fail('x', 'y')", "errors.fail('x', 'y')", 'tests/app/x.test.ts'],
    ['3.26', 'src/a.ts', "errors.fail('x', 'y')", "errors.fail('x', 'y')", '.claude/scripts/a.mjs'],
    ['3.27', 'app/x.ts', "log.error('x', (error as Error).message)", "log.error('x', errors.explain(error).message)"],
    ['3.27', 'src/a.ts', 'toast.error((e as Error).message)', '// (e as Error).message запрещён'],
    ['3.28', 'app/x.ts', "log.error('x', (error as Error).message)", "log.error('x', error)"],
    ['3.28', 'src/a.ts', "log.error('x', { error: (e as Error).message, taskId })", "log.error('x', e, { taskId })"],
    ['3.28', 'app/x.ts', "this.log.warn(`stop: ${(e as Error).message}`)", "toast.error((e as Error).message)"],
    ['3.28', 'app/x.ts', "logger.child('x').error('x', (e as Error).message)", "const message = errors.explain(e).message"],
    ['3.28', 'app/x.ts', "log.error('x', (e as Error).message)", "log.error('x', (e as Error).message)", 'docs/x.ts'],
    ['3.31', 'shared/types/ipc-channels.ts', "'app:files:createFile': { args: []; return: void }", "'app:files:create': { args: []; return: void }"],
    ['3.31', 'shared/types/ipc-channels.ts', "'app:files': { args: []; return: R }", "'app:file:get': { args: []; return: R }"],
    ['3.31', 'shared/types/ipc-channels.ts', "'paths:get': string", "'paths:dir': string"],
    ['3.31', 'shared/types/ipc-channels.ts', "'app:files:createFile': { args: []; return: void }", "// 'app:files:createFile' - старое имя"],
    ['3.31', 'shared/types/ipc-channels.ts', "'app:files:createFile': { args: []; return: void }", "'app:files:createFile': { args: []; return: void }", 'app/updater/handlers.ts'],
    ['3.31', 'shared/types/app-events.ts', "'settings:previewChanged': P", "'settings:preview:changed': P"],
    ['3.31', 'shared/types/app-events.ts', "'files:rescan': X", "'files:changed': X"],
    ['3.31', 'shared/types/app-events.ts', "'updater:error': E", "'updater:failed': E"],
    ['3.31', 'shared/types/app-events.ts', "'app:password:reset': P", "'app:file:password:changed': P"],
    ['3.31', 'shared/types/app-events.ts', '& { [K in `app:${Kind}:pinToggled`]: P }', '& { [K in `app:${Kind}:changed`]: void }'],
    ['3.31', 'shared/types/app-events.ts', '& { [K in `app:deleted_items:changed`]: void }', '& { [K in `app:${Kind}:changed`]: void }'],
    ['3.16', 'src/entities/item/create/ui/CreateItemDialog.tsx', '', '', 'src/entities/item/create/CreateItemDialog.tsx'],
    ['3.16', 'src/kit/table/hooks/useRowList.ts', '', '', 'src/lib/hooks/entity/useList.ts'],
    ['3.16', 'src/shell/pages/home/HomePage.tsx', '', '', 'src/shell/home/HomePage.tsx'],
    ['3.17', 'src/ui/copy-button.tsx', '', '', 'src/entities/item/table/item-table-config.tsx'],
    ['3.17', 'src/ui/copy-button.tsx', '', '', 'src/ui/shadcn/copy-button.tsx'],
    ['3.17', 'src/shell/home/use-home-data.ts', '', '', 'src/lib/hooks/ui/use-mobile.ts'],
    ['3.17', 'src/kit/table/data-table.tsx', '', '', 'src/kit/table/DataTable.tsx'],
    ['3.17', 'src/entities/item/create/use-create-item.ts', '', '', 'src/entities/item/create/useCreateItem.ts'],
    ['3.17', 'src/kit/card/CardPage.tsx', '', '', 'src/kit/card/CardWindow.tsx'],
    ['3.17', 'src/ui/FooPage.tsx', '', '', 'src/shell/home/HomePage.tsx'],
];

// [id, файл, откуда переехал, сработает ли]
export const MOVES = [
    ['3.16', 'src/entities/u/t/ui/X.tsx', 'src/entities/u/ui/X.tsx', false],
    ['3.16', 'src/entities/u/t/ui/X.tsx', 'src/entities/u/t/X.tsx', true],
    ['3.16', 'src/entities/u/t/X.tsx', 'src/entities/u/t/ui/X.tsx', false],
    ['3.17', 'src/ui/copy-button.tsx', 'src/ui/shadcn/copy-button.tsx', true],
    ['3.17', 'src/ui/copy-button.tsx', 'src/ui/search-input.tsx', false],
];

// Случай в две строки: первая - строка выше
const fires = (id, text, file) => {
    const [prev, line] = text.includes('\n') ? text.split('\n') : [undefined, text];
    return [...match(line, file, prev), ...matchPath(file)].some(r => r.id === id);
};

export function selftest() {
    let bad = 0;
    for (const [id, file, violation, clean, cleanFile = file] of CASES) {
        if (!fires(id, violation, file)) { console.error(`FAIL §${id}: не сработало на "${violation}" (${file})`); bad++; }
        if (fires(id, clean, cleanFile)) { console.error(`FAIL §${id}: ложное срабатывание на "${clean}" (${cleanFile})`); bad++; }
        if (match(violation, 'CLAUDE.md').length || matchPath(file.replace(/\.\w+$/, '.md')).length) { console.error(`FAIL §${id}: сработало на .md`); bad++; }
    }
    for (const [id, file, from, expected] of MOVES) {
        if (matchPath(file, from).some(r => r.id === id) !== expected) { console.error(`FAIL §${id}: перенос ${from} -> ${file}, ожидалось ${expected ? 'срабатывание' : 'молчание'}`); bad++; }
    }
    const lost = RULES.filter(r => !CASES.some(c => c[0] === r.id));
    for (const r of lost) { console.error(`FAIL §${r.id}: нет пары в CASES`); bad++; }
    console.log(bad ? `SELFTEST: ${bad} провалов` : `SELFTEST: ok, ${RULES.length} правил, ${CASES.length} пар, ${MOVES.length} переносов`);
    return bad ? 1 : 0;
}

export function scan(lines, file) {
    const out = [];
    let prev;
    lines.forEach((text, i) => {
        for (const r of match(text, file, prev)) out.push({ file, line: i + 1, text, ...r });
        if (text.trim()) prev = text;
    });
    return out;
}

if (process.argv[1]?.endsWith('rules.mjs')) process.exit(selftest());
