# Cion Warden

Правила проекта. Команды, скрипты и профили агентов - в `.claude/`.

Skills: `notes` `isgood` `isplan` `simplify` `ship` `planner` `sync-docs` `shadcn` - `/<имя>` в Claude Code.

Cion Warden - менеджер макро-скриптов (AutoHotkey) для Cion-экосистемы: скачать из GitHub-источников, запустить, обновить. Electron + React 19 + Tailwind v4 + shadcn на `@cion-suite/core` 2.x. Окно, IPC, события, settings, vault, логи, авто-обновление - из ядра. Продуктовое описание экранов и потоков - `docs/app.md`.

`@cion-suite/core` - link:'d (`../cion-suite/packages/core`). Правишь его src - пересобери dist, иначе приложение не увидит изменений.

---

## 1. Code Rules - приоритет номер один

DRY, KISS, Clean Code, **Clean API** - закон проекта. Нарушение - повод вернуть PR.
Исполняемая версия - `.claude/scripts/rules.mjs` (единый источник для `diff-scan`/`plan-scan`). Новое правило добавляй туда, а не только сюда.

### Clean API

Публичная поверхность - **один глагол на концерн**, находится автодополнением. Эталон: `events.emit/on`, `errors.fail/assert/wrap/is/explain`, канал = путь в `window` (`'a:b:c'` -> `window.a.b.c`), handlers - `... satisfies IpcHandlers` в `kernel.module({ handlers })`. НЕ `emitTo` / `sender.emitTo<>` / `webContents.send`.

- **Утилита липнет к своему namespace**, не к новому файлу: отдельные util-файлы с хорошим именем забывают и переписывают логику заново. Некуда приклеить - концерну нужен namespace.
- **Связный набор функций -> ОДИН namespace под ОДНИМ импортом**, не N свободных функций. Пример: `shell.splash.open` / `shell.main.open` / `shell.theme.set` (`app/shell/index.ts`), `paths.*` (`app/utils/paths.ts`), `schema.*` (`shared/schema.ts`).
- **Имена** (канал, событие, значение `IpcValueMap`; держит `rules.mjs` 3.31). Сегменты пути - существительные, одно слово в нижнем регистре, без camelCase. Лист канала - один глагол словаря: `get list find create copy update rename move delete restore add remove set reset toggle enable disable unlock open run connect resolve refresh sync import install request clear save exists preview relaunch extract export`; новый глагол - только с правкой словаря в `rules.mjs` 3.31. Лист события - причастие (`changed`, `failed`, `closing`), лист значения - не глагол (`app:env`). В канале коллекция во множественном (`users:list`), в событии об одном объекте сущность в единственном (`user:updated`); поля payload повторяют аргументы канала. Событие прогресса повторяет путь канала (`<канал>:progress`). Подписка: шина - `on`, стор - `get` + `subscribe`, закрытие UI-слота - `close`.
- **Имена в коде.** Член namespace - одно слово (глагол или существительное-геттер чистого чтения), составной лист -> вложенный namespace; член за каналом называется листом канала; акронимы в типах заглавными (`URL`, `ID`); ключ react-query = `[путь канала, ...аргументы]`; схема опций - `schema.<глагол><Сущность>`, тип `<Ключ>Options`; тип результата канала - существительное канала без `Info` / `Result` / `Data`. Ключи settings / state - существительные camelCase с префиксом концерна, данные по id - один `Record` на концерн.
- Лучше поправить `@cion-suite/core`, чем городить обёртку в приложении.

### Остальное

- **DRY.** Перед новой функцией/хуком/утилитой - ищи существующую. Сначала `node .claude/scripts/map.mjs <имя> [имя...]` - где символ объявлен (файл, строка, сигнатура), включая слинкованный `@cion-suite/core`; несколько кандидатов за один вызов. Полный скан ~0.2 s, индекс не хранится. Дома: `src/lib/` (utils, hooks, state, i18n), `src/kit/` (config-driven модули; сейчас `catalog-actions`, `config-form`), `src/ui/` (примитивы и мелкие generic-компоненты), `src/shell/` (оболочка окна), корень сущности `src/entities/<e>/` (её ядро), `app/<концерн>/`, `app/utils/`. Дерево папки - `git ls-files <папка>`; замысел и исключения - `docs/architecture.md`. Чистка готового diff'а - `/simplify`.
- **KISS.** Три похожие строки лучше преждевременной абстракции. Не пиши error-handling для невозможных сценариев. Валидация - только на границах.
- **Clean Code.** Самоочевидные имена, плоские функции. Комментарии - **только WHY** (неочевидный инвариант, обход бага, скрытое ограничение): не больше 2 строк, не больше 60 символов текста в строке; длиннее - сожми до сути. Никакой истории ("раньше было...", "fix #123") - она в commit-сообщении.
- **Только клавиатурные символы.** Комментарии, документация и commit-сообщения - кириллица, латиница, ASCII. Без стрелок, длинного тире, box-drawing и прочих юникод-значков: `->` вместо стрелки, `-` вместо тире, `--` вместо линий из box-drawing. Текст до этого правила не переписываем - только новый и правленый. Комментарий в коде ловит `rules.mjs` (3.29), остальное - глазами.
- **Ошибки и логи.** Handler в `app/` **кидает** (`errors.fail` из `@cion-suite/core`), а не возвращает `{ ok: false }`. `errors.fail` ошибку **возвращает** - бросает call-site: `throw errors.fail(...)`, иначе валидация молча становится no-op. Охранное условие - `errors.assert(cond, msg, code?)` (через namespace: деструктурированный `assert` теряет `asserts`-сигнатуру). `throw errors.wrap(e, msg)` сам дописывает причину в сообщение и сохраняет её код: текст `e` в `msg` не клеим. Код ошибки на границе - явный: отказ внешней операции - `'failed'`, недоступный сервис - `'unavailable'`, плохой ввод - `'validation'`; `'unknown'` в `fail` не принимается - его выводит только `classify`. Бросающий handler сам не логирует: журнал ведёт `ipc.configure`. `(e as Error).message` запрещён - `errors.explain(e).message` или `e` целиком в log (`logger.error('ctx', e)`). `console.*` не оставляем - `logger` / `logger.child('Scope')` ядра. `any` / `as any` запрещены.
- **React 19.** Compiler мемоизирует сам - `useMemo` / `useCallback` не пишем. Исключение, всегда с комментарием WHY: хук не компилируется, либо функция - зависимость эффекта (`exhaustive-deps` не видит мемоизацию компилятора). `function App(): JSX.Element` - `TS2503`: inference или `ReactElement`.
- **Границы.** args - недоверенный ввод: каждый аргумент, уходящий в FS/процесс/сеть, описан zod-схемой в записи канала `{ args: [схема, ...], handle }`; `handle` получает уже разобранные значения, отказ разбора - `validation`. Готовые схемы - `schema.*` из `shared/schema.ts`; необязательный аргумент - `.optional()`; тип опций канала - `z.input<typeof schema.X>` (через `import type`). `0` валиден: `z.number()`, не `!value`; пустую строку отвергает `z.string().min(1)`. Доменная проверка вне схемы - `errors.assert`.
- **Тесты** - в `tests/`, зеркально исходнику: `tests/<путь>/<модуль>.test.ts` <-> `<путь>/<модуль>.ts`; `<модуль>.<аспект>.test.ts` - пара `<модуль>.ts`. Тест вне `tests/` или без пары валит `pnpm lint` (`@cion-suite/core/tests`).
- **Иконки lucide** - имя с суффиксом `Icon` (`SearchIcon`, не `Search` и не `Search as SearchIcon`): без суффикса имя сталкивается с типами и компонентами сущностей.
- **Пути к ресурсам** - только `app/utils/paths.ts` (namespace `paths`): после electron-vite `__dirname` = `build/out/main/`, прямые пути ломаются.

### UI - все решения через skill `/shadcn` (БЕЗ ИСКЛЮЧЕНИЙ)

**MANDATORY FIRST STEP для любой UI-задачи** - до Read/Edit/Write вызови `/shadcn`. Пропуск = нарушение, верни PR.

- **Триггеры** (любой -> skill обязателен): редизайн/рефакторинг экрана или компонента; выбор shadcn-компонента (Card vs Panel, Tabs vs Accordion, Dialog vs Sheet); композиция layout'а (grid/list/stack/sidebar); новый primitive (`npx shadcn add`); стилизация / классы Tailwind v4; паттерны форм/диалогов/таблиц/settings/navigation; правки в `src/ui/**`, `src/shell/**`, `src/kit/**`, `src/entities/<e>/**` (UI-части).
- **Не-триггеры:** i18n-ключ / строковый литерал без разметки; business-логика хука без UI; bugfix в not-UI коде (main / IPC handler / utility).
- **Жёстко:** `src/ui/shadcn/**` не редактируется руками - только `npx shadcn add <comp>` или через skill (lint игнорит этот путь). Сомневаешься - вызови skill.

---

## 2. Commands

```bash
pnpm dev                # install-electron && electron-vite dev (main + preload + renderer)
pnpm build              # electron-vite build -> build/out/
pnpm dist               # check:placeholders + build + electron-builder (latest)
pnpm check:placeholders # placeholder-URL / appId / метаданные заменены; URL в shared/config.ts == electron-builder
pnpm typecheck          # front + back + node
pnpm typecheck:front    # src/ + shared/ и их тесты
pnpm typecheck:back     # app/ + shared/ и их тесты
pnpm lint               # ESLint (boundaries/dependencies - границы слоёв и сущностей)
pnpm test               # vitest run (tests/ - зеркало app/ shared/ src/; окружение node)
pnpm ship               # typecheck + lint + test + build
```

> Корневой `tsconfig.json` имеет `"files": []` - `tsc --noEmit` без `-p` не проверяет ничего. Всегда `typecheck` / `typecheck:front` / `typecheck:back`.

`pnpm dist` сначала прогоняет `check:placeholders` - релиз с placeholder-URL'ами / appId не соберётся (bypass `ALLOW_PLACEHOLDERS=1`, только для отладки, не для релиза).

---

## 3. Architecture - инварианты

Эталон раскладки `src/` - `docs/standard.md` (неприкосновенный), замысел и исключения - `docs/architecture.md`.

- **Импорты - четыре правила** (держит ESLint `boundaries/dependencies`, случай на каждое правило - `tests/eslint.config.test.ts`):
  1. Направление: `app -> shell | entities -> kit -> ui -> lib`. `shell` и `entities` друг друга не импортируют.
  2. Ядро сущности - файлы в корне `src/entities/<e>/`, папки-части не в счёт - импортирует только `kit`, `ui`, `lib` - ни других сущностей, ни частей своей.
  3. Чужая сущность импортируется только через `index.ts` - её собственный или её части. Корневой `index.ts` сущности части не реэкспортирует.
  4. `kit` - только через `index.ts` модуля (`@/kit/<модуль>`), внутри модуля - не свой `index.ts`: барель -> файл -> барель замыкает цикл.
- **Исключение.** `app` из правила 3 исключён: маршрутизатор импортирует экраны (`<X>Page.tsx` сущностей и оболочки).
- **Сущности warden.** В `src/entities/` четыре сущности, у всех нет ядра (файлов в корне), корневых `index.ts` тоже: `source` (части `manage`, `sync`), `script` (`list`, `catalog`, `values`, `deps`), `library` (`list`), `bind` (`grid`, `form`). Наружу выходят только `source/manage` (`SourcesButton`) и `source/sync` (`useSourcesSync`): их импортируют `script/catalog`, `library/list`, `bind/grid`. Модули `kit`: `catalog-actions` (install / remove / openFolder / sync для `library` и `bind`, различия - конфигом) и `config-form` (форма полей cfg скрипта и пресета, общая для `script/values` и `bind/form`). Оболочка - `src/shell/`: `layout`, `navbar`, `sidebar`, `settings`, `update` (в нём экран `changelog`); таблица разделов - `src/shell/sidebar/sections.ts` (маршруты `#/scripts`, `#/get-scripts`, `#/libraries`, `#/binds`, `#/changelog`, `#/settings`). Новую сущность и модуль `kit` добавляй по `docs/standard.md`.
- **Данные renderer.** Запросы - react-query, ключ `[путь канала, ...аргументы]`. События main сбрасывают кэш централизованно в `useQuerySync` (`src/lib/hooks`, вызывается в `Layout`); после мутации хук сам зовёт `useInvalidate`, не дожидаясь события. Исход GitHub-операции - `useGithubToast` (`src/ui`) по правилу `githubFailure` (`src/lib/github-error.ts`): разбор по `errors.explain(e)`, не по тексту.
- **Ядро и части.** Ядро - файлы в корне сущности: `types.ts`, `index.ts` (явный список экспортов, не `export *`), display-компоненты, taxonomy и хуки, которые нужны нескольким частям или `kit`. Часть - любая подпапка `src/entities/<e>/<часть>/`; её `index.ts` - только если часть импортируют снаружи. Экран маршрута - `<X>Page.tsx` в части, которую он показывает. Сущность без ядра возможна.
- **Один сценарий = одна часть** (модалка / форма / drawer / хук): плоская папка, роль файла - в его имени (`<X>.tsx`, `use<X>.ts`). Часть несёт свою логику - компонент, хук либо orchestration в `<часть>/api.ts` (toast-жизненный цикл, ветвление, побочные эффекты). Голая обёртка `return window.x.y(<те же аргументы>)` - алиас, а не часть: зови канал на call-site.
- **Операция -> тост.** Результат IPC-операции показывает `toast.result(window.<ns>.<method>(...), { success?, error })` (`src/ui/toast.ts`): без ручных веток `.success`, `try/catch` и `toast.error` вокруг самого вызова. Ошибка вне операции - `toast.error('<фраза>', { cause: e })`; текст ошибки в UI - `errors.explain(e).message`, не `.message`: он снимает префикс Electron и маркер кода.
- **Оболочка и сущности.** Оболочка окна (layout, navbar, sidebar, служебные экраны `home` / `settings` / `update`) -> `src/shell/`. Композиция в крупный блок (таблица, профиль) - тоже часть сущности: `entities/<e>/table/`, `profile/`.
- **kit без сущностей.** `kit` не знает ни одной сущности: источники данных, picker'ы, бейджи и подсказки получает пропсами. Экраны и части берут конфиги из `index.ts` сущности.
- **Циклы.** Части разных сущностей импортируют друг друга через `index.ts` - линтер этого не запрещает. Файловые циклы между сущностями исключает правило 2, свой барель внутри модуля `kit` - правило 4, остальное держит только `graph.mjs cycles` (он же в `/ship`): после правок импортов между частями прогоняй `node .claude/scripts/graph.mjs cycles`.
- **Раскладка `app/`.** Концерн = папка (`shell`, `updater`), `<концерн>/module.ts` - его `kernel.module` (экспорт `<имя>Module`); файл карты = карта каналов и её zod-схемы; общее - `shared/schema.ts`, `app/utils/`. Экземпляры и синглтоны живут в своих файлах, не в `module.ts`: иначе handlers и module замкнутся в цикл. Новый концерн - своя папка и строка в `kernel.run({ modules })` в `app/main.ts`. Концерны warden (порядок в `modules`; `needs` - только предки выше): `shell`, `sources`, `github` (needs `sources`), `catalog` (`sources`, `github`), `fonts` (`sources`, `catalog`), `libs`, `binds`, `scripts` (каждый needs `catalog`), `updater`. Граф только вниз: `sources` не импортирует другие концерны (удаление шрифтов источника - событие `source:changed`). Состав и владение каналами - `docs/architecture.md`.
- **IPC.** Канал объявляется ОДИН раз в `shared/types/ipc-channels.ts` (declaration-merge в `IpcChannelMap`). Имя канала = путь в `window` (`'a:b:c'` -> `window.a.b.c`), отдельной строки фасада нет: `bridge.expose()` в preload строит `window.<ns>.*` из имён каналов и значений, типы `window` объявляет `@cion-suite/core/renderer`. Main - карта `handlers` модуля: `... satisfies IpcHandlers` в `kernel.module({ handlers })`, handler не получает `event` - отправителя и окно даёт `ipc.caller()`, renderer - `window.<ns>.*`. Значения main -> renderer (read-only) - `IpcValueMap` и `kernel.run({ values })`: ключ - путь в `window`. Жизненным циклом процесса (lock, `whenReady`, boot, выход, фатальные ошибки) владеет `kernel.run` в `app/main.ts`: своих `before-quit` / `window-all-closed` / `process.on` не заводим. Отключённые сервисы - `kernel.module({ enabled })`. Никаких Node API в renderer.
- **События.** Из main - `events.emit(name, payload)` (всем окнам), `{ target: win }` (одному), `{ except: win }` (всем кроме одного). Тип имени и нагрузки - `EventMap` (`shared/types/app-events.ts`). Renderer - `useEvent()` / `events.on()`. `webContents.send` и `ipcRenderer.on` вне preload запрещает ESLint `@cion-suite/core/primitives`.
- **Хранение - четыре уровня** (CONFIG / settings / state / vault), таблица - `docs/architecture.md` (Уровни хранения). `settings` и `vault` - синглтоны `@cion-suite/core`, экземпляров не создаём: схема настроек - `shared/settings.ts` (у каждого ключа `.default()`, вложенный объект - `.prefault({})`), `settings.configure({ schema })` - в `app/main.ts` до `kernel.run`. `state` (renderer) - `state.create({ defaults, storage? })` один раз в `src/lib/state.ts`; компонент читает `useStored(store, key)`. Своих electron-store и ручных `localStorage`-обёрток нет.
- **Credentials** - только `vault` из `@cion-suite/core` (`vault.get/set/delete`), plaintext запрещён.
- **Окна** - только через `shell` (`app/shell/`) поверх `windows.create` / `windows.splash` ядра; главное окно - `show: 'content'` + `windows.ready()` из `Layout`; геометрия - `persist` ядра. `new BrowserWindow`, `ipcMain.handle`, `contextBridge.exposeInMainWorld`, `webContents.send`, `safeStorage` вне ядра запрещает ESLint `@cion-suite/core/primitives`.
- **Входы ядра.** `@cion-suite/core` - `app/`, `@cion-suite/core/preload` - `app/preload.ts`, `@cion-suite/core/renderer` - `src/`; `shared/` - только `import type`. Правило `@cion-suite/core/entries` (`core.configs.recommended` из `@cion-suite/core/eslint`) держит это.
- **Размещение типов:** main+renderer -> `shared/types/`; backend-only -> `app/`; renderer, общие для сущностей -> `src/lib/types/`; локальные для части -> `src/entities/<e>/<часть>/types.ts`; типы сущности -> `src/entities/<e>/types.ts`. Никогда inline в компонентах; `import type` (`verbatimModuleSyntax`).

---

## 4. Pitfalls

- **`__dirname`** бандлится в `build/out/main/` (`build/out/<процесс>/index.js` для main и preload): для splash / иконок / ресурсов только `paths.ts`.
- **Module augmentation** (`IpcChannelMap`, `IpcValueMap`, `EventMap`, `Register`) живёт в `shared/` и доходит до обоих процессов через tsconfig include. Augmentation сама не добавляет целевой модуль в программу: файл с `declare module '@cion-suite/core'` держит `import type {} from '@cion-suite/core'`, иначе front падает с `TS2664`. Проверка необъявленного канала - excess property check, работает только на объектном литерале.
- **Tailwind v4** - CSS-first: theme через `@theme inline` в `src/app/styles/index.css`, `tailwind.config.js` нет.
- **Zod** - версия строго совпадает с `zod` в `cion-suite` (exact, не range): иначе схемы приложения и ядра - разные классы, `instanceof` и типы расходятся молча. Обновляй вместе с ядром.
- **Stale core dist.** Ядро - `link:`, его `dist` в git не лежит. Правка src ядра или `git pull` в `cion-suite` без `pnpm -r build` - приложение видит старые типы и поведение; `typecheck` красный на несуществующем экспорте - сначала пересобери ядро.
- **ESLint-плагины** `@cion-suite/core/eslint` резолвятся из слинкованного `cion-suite`: без собранного `dist` ядра `pnpm lint` не стартует.
- **CSP `style-src 'unsafe-inline'`** в `index.html` - осознанный релакс: Tailwind v4 + Vite HMR инжектят inline `<style>`, `onHeadersReceived` не применяется к `file://` prod `loadFile`. Строгая CSP в prod - custom protocol (`app://`), out of scope.
- **`npmRebuild: false`** в `electron-builder.json` - корректно без native deps. Добавил `keytar` / `better-sqlite3` / N-API модуль - переключи в `true` или запусти `npx electron-builder install-app-deps`.
- **Updater** в dev не проверяет обновления (`app.isPackaged`); канал один - latest.
- **Имя приложения и `userData` закреплены** первыми строками `app/main.ts`: `app.setName(CONFIG.appId)` и `app.setPath('userData', paths.userData())` (`%APPDATA%\@cion-suite\warden`). Сторы `vault` и `settings` называются по `app.getName()` (файлы `io.cion.warden-secure` и `io.cion.warden-settings` в `userData`): токены и настройки прежнего warden читаются без миграции. Смена `CONFIG.appId` или пути в `paths.userData` осиротит список источников, `global_vault`, индекс шрифтов, Local Storage и оба стора. `name` / `productName` в `package.json` на путь не влияют.
- **`global_vault` - не `vault`.** `global_vault/<sourceId>/` - локальная копия репозитория источника (скрипты, lib, пресеты, manifest); `vault` ядра - только секреты (PAT источников, ключ `source:token:<sourceId>`).
- **Шрифты - только win32** (реестр HKCU, `%LOCALAPPDATA%\Microsoft\Windows\Fonts`): на других ОС `fonts:install` возвращает нули.
- **Лог версий** (`docs/versions/*.md`) читает main (`updater:changelog:get`, `paths.changelog`): в dev из `docs/versions/`, в сборке из `resources/versions/` - туда файлы кладёт `extraResources` в `electron-builder.json`. Убрал запись - экран "Что нового" тихо покажет пустой лог.
- **Заголовок раздела версии** - один regex в трёх местах: `.claude/scripts/notes.mjs` (пишет), `scripts/release-notes.mjs` (CI), `src/shell/update/changelog-filter.ts` (renderer). Из CI и renderer `.claude/` не импортируется, поэтому копии; менять только все три разом.

---

## 5. Before first ship

Что в warden уже заменено: `appId` (`io.cion.warden`), `productName` (`Cion Warden`), `index.html` `<title>`, `app/splash.html`, `name` / `homepage` / `repository` в `package.json`. Осталось (`pnpm check:placeholders` не даст собрать `dist`, пока остаются placeholder'ы). **Инвариант:** `CONFIG.releases` в `shared/config.ts` == `publish[]` в `electron-builder.json` (owner/repo, по порядку).

| Где | Что |
|---|---|
| `shared/config.ts` | `releases` - репозитории релизов (`Lazy-World/wf-macro`, приватный `cion-suite/cion-warden`) |
| `electron-builder.json` | `publish[]` - те же owner/repo, что `releases`; `artifactName` без пробела (GitHub переименует ассет, и он разойдётся с `latest.yml`) |
| `public/assets/` | иконки (`icon.png`, `icon.ico`, `icon.icns`, `icon_dev.ico`) побайтно совпадают с шаблоном: нужны иконки warden |
| `package.json` | `author` - object с `name` + `email` для подписи (сейчас строка); `description` - убрать хвостовой пробел |
| `docs/versions/release.md` | раздел версии пишет `/notes` (раздел 9); перед первым релизом - `/notes <корневой коммит>..HEAD --replace` |
| `.github/workflows/release.yml` | править нечего; в репозитории: секреты `CION_SUITE_PAT` и `WF_MACRO_TOKEN` (fine-grained PAT, `contents: write` на `Lazy-World/wf-macro`), Settings -> Actions -> General -> Workflow permissions -> Read and write (иначе тег и Release не создать) |

Не менять: `CONFIG.appId` и `paths.userData()` (раздел 4, "Имя приложения и `userData` закреплены") - иначе токены источников, настройки и все локальные данные прежнего warden осиротеют. В `package.json` `productName` не добавлен: на путь он не влияет, а имя приложения и так задаёт `app.setName` в `app/main.ts`.

---

## 6. STOP & ASK

- **Неоднозначные требования** - спроси, не угадывай.
- **Никакого рефакторинга "попутно".** Не трогай код вне задачи. TODO/tech-debt - отметь, не фикси.
- **Reuse > новое.** Не нашёл утилиту/namespace - спроси перед созданием нового файла.
- **План в `docs/planned-now.md`** (план один; `/planner` перезаписывает завершённый; пустой файл - плана нет) - выполняй ВСЕ шаги фазы (typecheck -> `pnpm lint` -> `pnpm test` -> `/isgood` -> `/notes`), отметь фазу done и **жди подтверждения** перед следующей.

---

## 7. Subagents - лестница стоимости

Останавливайся на первой ступени, которая закрывает вопрос:

1. **Скрипт** - детерминированный факт: где объявлен символ, кто кого импортирует, циклы, нарушения правил, битые ссылки, scope диффа.
2. **haiku-веер** - триаж списка, который собрал скрипт.
3. **Opus** - вердикт, семантика, синтез. Не сканирование.

**Скрипты `.claude/scripts/`**

- Зови в **любом** запросе, не только внутри слэш-команды: обход файлов руками там, где есть скрипт, - ошибка.
- **Скрипт соврал - чини скрипт, а не обходи находку.** Воспроизведи сценарий, доработай (общие правила - `rules.mjs` + самопроверка), прогони заново.
- Usage - в шапке файла: `head -6 .claude/scripts/*.mjs`. Здесь не дублируется.
- Набор: `map` (где объявлен символ), `graph` (циклы, радиус поражения), `diff-scan` (скан диффа для `/isgood`), `plan-scan` (сверка плана для `/isplan`), `doc-refs` (битые ссылки в доках для `/sync-docs`), `notes` (дайджест для `/notes`), `ship` (pre-flight для `/ship`), `mv` (перенос файлов с перепиской импортов), `rules` (исполняемые правила), `lib` (общее для скриптов).
- `map`, `graph`, `rules` на диск не пишут - зови свободно.
- Общее для скриптов (файлы репозитория, дифф с untracked, кеш, дочерние процессы) - `lib.mjs`. Новый помощник - туда, в его namespace, а не копией в скрипт.
- Кеш `diff-scan` / `plan-scan` / `doc-refs` / `notes` / `ship` - `.claude/cache/<команда>/`. Скрипт сносит его на старте, ты - за собой в конце, в любом исходе. Stdout скрипта - сводка и маршрут; отчёт читай только своим срезом.

**Агенты** (routing - `.claude/agents/README.md`)

| Агент | Зона |
|---|---|
| `expert-electron` | main-процесс: старт, окна, preload, updater, `app/utils`, `src/shell`; `shared/config.ts`, `shared/settings.ts` |
| `expert-warden` | домен warden: `app/{sources,github,catalog,fonts,libs,binds,scripts}`, `shared/` (schema, cmd, repo, контракты каналов и событий), инвалидации renderer |
| `expert-renderer` | renderer: `src/` (shell, entities, kit, ui, lib), границы слоёв, размещение файлов |
| `code-reviewer` | ревью diff'а / staged / PR; семантический проход `/isgood`, `/isplan` |
| `bug-fixer` | баг с неясной причиной: root-cause и минимальный фикс |
| `triage` | вердикт по строкам отчёта скрипта (haiku), без фиксов |

- Все вызовы веера - в **ОДНОМ** tool-блоке, иначе пойдут последовательно. Каждому - свой срез отчёта.
- Не делегируй тривиальное: 1 файл, <=20 строк, без cross-core. Десяток находок дешевле разобрать самому.
- 2+ области - главный агент зоны, где живёт сценарий; чужой слой ревизует профильный `expert-*` параллельным вызовом.

---

## 8. Git

Формат commit-сообщений - `/notes`. Перед предложением commit: `/isgood` -> правки -> `/notes`. Pre-flight - `/ship`. Версии, логи и релиз - раздел 9.

Коммиты только локальные: ветка + commit, без push и PR - пушит пользователь. Атрибуцию (`Co-Authored-By`, `Claude-Session` и подобные trailer'ы) в commit-сообщения и PR не добавляем.

---

## 9. Версии и релизы

Лог для пользователей - файлы `docs/versions/`, их читает окно "Что нового" в приложении. Пишет их только `/notes` (`.claude/scripts/notes.mjs write`), руками файлы не правим. Changesets не используем.

```text
feature/version-2.x    правки по фазам      /notes -> docs/versions/release.md
        |                                  (каждая фаза: раздел версии)
        |
        |  версия 2.1.0, /notes v2.0.0..HEAD --replace -> docs/versions/release.md
        v  merge / PR
main  --------------------------------------------------- 2.1.0     только релизы
                                                            |
                                          CI зелёный (push в main)
                                                            v
                      workflow Release: сборка установщика, тег v2.1.0 + GitHub Release (текст = раздел release.md)
                      в cion-suite/cion-warden и Lazy-World/wf-macro
```

- **Файл.** Лог один - `release.md`. Выпускаются только стабильные версии: версия с суффиксом (`-beta.N`, `-alpha.N`) - `/notes` отказывает.
- **Формат раздела.** `### Версия vX.Y.Z`, ниже буллеты `- текст`, разделы новые сверху, между ними строка `---`. Буллеты - либо плоским списком (до 5 штук; от 6 категории обязательны, `write` откажет), либо под подзаголовками-категориями `#### Название` из закрытого словаря (`Важно знать`, `Скрипты и бинды`, `Библиотеки и источники`, `Обновления`, `Интерфейс`, `Прочее`): `Важно знать` - то, что меняет привычное поведение или требует действий пользователя (потеря данных, несовместимость), всегда первой; остальные - по частям приложения; в малом разделе (до 5 буллетов) категории допустимы, но не нужны. Порядок категорий каноничный, `write` расставляет их сам; новая категория - правкой словаря `CATEGORIES` в `.claude/scripts/notes.mjs`, описаний в `.claude/commands/notes.md` и этой строки. Других подзаголовков и emoji нет, только клавиатурные символы. Пример:

  ```markdown
  ### Версия v2.1.0

  #### Важно знать

  - Обновление перезаписывает скрипты целиком: ручные правки теряются.

  #### Интерфейс

  - Добавлена кнопка ручной проверки обновлений.

  ---

  ### Версия v2.0.0

  - Ускорено первое открытие приложения.
  ```
- **`/notes` в работе.** Без аргумента, после каждой фазы: `[USERS]` - итоговый список ВСЕГО раздела текущей версии: уже записанные буллеты (`section.txt`) сведены с новыми, `write` заменяет раздел целиком и печатает убранное (раздела нет - создаётся сверху). Раздел - итог относительно прошлой версии, а не история правок: в нём нет пар "добавлено" и "удалено" или "добавлено" и "исправлено" об одном и том же. `[GIT]` в файл не идёт - только в commit-сообщение.
- **`/notes` в релизе.** `/notes <тег прошлого релиза>..HEAD`: `[USERS]` строится от суммарного диффа диапазона, а не склейкой промежуточных записей (фича, которую дорабатывали по ходу работы, для пользователя релиза - просто добавленная). Раздел создаётся в `release.md`; уже есть - отказ, перезапись только `--replace` после явного согласия. Скрипт сам выбирает файл, вставляет раздел, проверяет формат и ASCII; от модели нужны только текст буллетов и их категории.
- **Тег и Release.** Только стабильные релизы и только из `main`: workflow `.github/workflows/release.yml` запускается после зелёного CI на push в `main` (или вручную из `main`), читает версию из `package.json` и:
  - версия с суффиксом -> пропуск без ошибки; тег `vX.Y.Z` проверяется в каждом репозитории отдельно, уже есть -> пропуск только для него;
  - иначе берёт раздел `### Версия vX.Y.Z` из `release.md` (`scripts/release-notes.mjs`, без зависимостей и вне `.claude/`), собирает установщик (job `build`, windows-runner) и создаёт одинаковые GitHub Release с текстом раздела и ассетами: в этом репозитории с `GITHUB_TOKEN` (тег на `head_sha` создаётся вместе с Release, упавший Release тег не оставляет) и в `Lazy-World/wf-macro` с секретом `WF_MACRO_TOKEN` без `--target` (коммита warden там нет, тег встаёт на HEAD ветки по умолчанию).
  - Нет непустого раздела версии -> Release красный, тега нет: релиз без лога не создаётся (задумано). Merge в `main` с новой версией без записи в `release.md` - красный Release; первый merge в `main` с версией `1.0.0` красный, пока нет раздела `### Версия v1.0.0`.
- **Установщик.** CI собирает его на windows-runner (`pnpm dist`: `check:placeholders` + build + `electron-builder --publish never`) и прикладывает exe, blockmap и `latest.yml` к Release в обоих репозиториях; руками ничего не выкладывается.
- **Порядок релиза.** (1) на ветке версии поднять `package.json` до стабильной (`2.1.0`) и **закоммитить**: диапазонный `/notes` читает версию из `package.json` на конце диапазона (`HEAD`), незакоммиченный bump он не видит и возьмёт старую версию; (2) `/notes <тег прошлого релиза>..HEAD` -> раздел в `release.md`; первого релиза тега нет - вместо него корневой коммит (`git rev-list --max-parents=0 HEAD`), `/notes <корневой коммит>..HEAD`; (3) commit лога, merge в `main`; (4) CI зелёный -> Release создал тег; (5) Release с установщиком появляется в обоих репозиториях.
- **В приложении.** Окно "Что нового" (`#/changelog`) показывает лог версий из `release.md`; после обновления один раз открывается диалог с разделами между прошлой показанной и текущей версией (не при первом запуске и не при откате). Устройство - `docs/architecture.md`, раздел "Версии и лог".
