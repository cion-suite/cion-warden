# Cion Warden - текущая архитектура

> **Статус:** реальное состояние кода: замысел, связи между процессами, три входа `core`, уровни хранения, исключения. Эталон - `docs/standard.md` (неприкосновенный): раскладка `src/` по сущностям.
> Расхождения с эталоном - в разделе "Исключения". Карт файлов нет: дерево - `git ls-files`, потребители - `node .claude/scripts/graph.mjs deps <путь>`.

Cion Warden - менеджер AutoHotkey-скриптов: источники (репозитории GitHub) -> каталог (manifest) -> локальная копия `global_vault` -> запуск. Продукт и потоки - `docs/app.md`.

Стек: Electron (main + preload + renderer через `electron-vite`), React 19 + React Compiler, TypeScript strict (`verbatimModuleSyntax`), Tailwind v4 (CSS-first), shadcn, `@cion-suite/core` 2.x (kernel, ipc, events, settings, vault, windows, logger, errors).

## Backend (`app/`)

Правило раскладки: **концерн = папка**, `<концерн>/module.ts` - его `kernel.module`; файл карты (`handlers.ts`) = карта каналов и её zod-схемы. Экземпляры и синглтоны живут в своих файлах, не в `module.ts` (иначе handlers и module замкнутся в цикл).

```
app/                      # main process -> build/out/main/
  main.ts                 # entry: setName + userData, crashReporter, setAppUserModelId, settings.configure + ipc.configure + kernel.run (modules, values, ready)
  preload.ts              # `bridge.expose()` -> `window.<ns>.*`, значения main, события
  splash.html             # splash ядра
  shell/                  # нижний слой: index.ts (namespace `shell`: splash.open / update / close, main.open / focus / shown, theme.set), module.ts
  sources/                # store.ts (sources.json, seed, CRUD), tokens.ts (PAT в vault, маска), handlers.ts, module.ts
  github/                 # index.ts (namespace `github`: клиенты api / raw, tree с etag, файл, probe, rate-limit, перевод статуса в код ошибки), types.ts, handlers.ts, module.ts
  catalog/                # manifest.ts, derive.ts, metas.ts, sync.ts, install.ts, fanout.ts, index.ts (namespace `catalog` для libs и binds), start.ts, types.ts, handlers.ts, module.ts
  fonts/                  # installer.ts (установка и снятие, win32), ledger.ts (индекс installed-fonts.json, mutex), registry.ts (HKCU, оповещение системы), start.ts, handlers.ts, module.ts
  libs/                   # files.ts (скачать / удалить lib), handlers.ts, module.ts
  binds/                  # files.ts (пресеты на диске), preset.ts (схема и значения пресета), handlers.ts, module.ts
  scripts/                # index.ts (namespace `scripts`: список, статусы, пути), processes.ts (запуск, остановка, сверка с ОС), watcher.ts (fs.watch), deps.ts (чего не хватает скрипту), ahk.ts (#Include), handlers.ts, module.ts
  updater/                # module.ts (`updaterModule`), updater.ts - electron-updater через ядро; канал latest / beta - в settings; лог версий - `updater:changelog:get`
  utils/                  # paths.ts (namespace `paths`, единственный дом путей), environment.ts (`env`), fsx.ts (namespace `fsx`: confine, атомарная запись, json, sha как у git)
```

Вне `app/`: `scripts/` - `check-placeholders.mjs` (гейт `dist`) и `release-notes.mjs` (текст GitHub Release для CI, без зависимостей); `docs/versions/` - лог версий; `.github/workflows/` - `ci.yml` и `release.yml`.

Новый концерн - своя папка с `module.ts` и строка в `kernel.run({ modules })`; новый корневой сегмент канала (`window.<ns>`) - ещё и в `WINDOW_NS` в `eslint.config.js`. Порядок и зависимости модулей задаёт `needs` (только предки выше по списку), статус модулей читает renderer через `kernel.status()`.

### Концерны и владение каналами

Порядок в `kernel.run({ modules })`: `shell, sources, github, catalog, fonts, libs, binds, scripts, updater`. Граф только вниз: `sources` не импортирует ни один другой концерн, `needs` совпадает с реальными импортами.

| Концерн | needs | Каналы | События эмитит | start / stop |
|---|---|---|---|---|
| `shell` | - | - | - | тема из settings, splash |
| `sources` | - | `sources:{list,add,update,remove}`, `sources:token:{set,remove}` | `source:changed` | start: seed источника по умолчанию, если нет `sources.json` |
| `github` | `sources` | `github:limit:get`, `github:repo:get` | `github:limit:changed` | - |
| `catalog` | `sources`, `github` | `catalog:sync`, `catalog:scripts:{list,install}` | `source:synced` | start: `mkdir global_vault`, splash 50 |
| `fonts` | `sources`, `catalog` | `fonts:{list,install,remove}` | - | start (win32): подписки на `source:synced` (установка) и `source:changed remove` (снятие), reconcile индекса по списку источников; stop: снять подписки |
| `libs` | `catalog` | `libs:{list,install,sync,delete}`, `libs:folder:open`, `libs:web:open` | `lib:changed` | - |
| `binds` | `catalog` | `binds:{list,install,sync,delete}`, `binds:folder:open`, `binds:schema:get`, `binds:values:{get,save,reset}` | `bind:changed` | - |
| `scripts` | `catalog` | `scripts:{list,run,delete}`, `scripts:processes:{get,remove,clear}`, `scripts:folder:open`, `scripts:config:{get,save}`, `scripts:deps:get` | `script:changed`, `script:status:changed` | start: watcher (сбой - `warn`, модуль остаётся `running`); stop: закрыть watcher |
| `updater` | - | `updater:{refresh,install}`, `updater:changelog:get` | `updater:{checked,available,progress,downloaded,failed}` | start: подписки electron-updater, плановые проверки после показа окна, splash 70; stop: `quitAndInstall`, если обновление скачано |

- **Источники.** Список источников на диске - без токенов; PAT в `vault` ядра, ключ `source:token:<sourceId>`; renderer получает `tokenMask`. `sources:remove` в порядке: токен, запись, событие. Шрифты источника снимает `fonts` по событию `source:changed`, а не вызовом из `sources`.
- **GitHub.** Два клиента `http.create` (`api.github.com`, `raw.githubusercontent.com`), ретраев нет, таймаут 20 с (120 с на скачивание файла), токен - заголовком на вызов. Условный запрос tree (etag, 304) и `x-ratelimit-*` - через `http.send`. Одна точка перевода HTTP-статуса в код ошибки: 401 / 403 -> `unauthorized`, 404 у private -> `forbidden`, 404 у public -> `not_found`, лимит -> `rate_limited`; `status` остаётся в ошибке, renderer разбирает по `errors.explain(e)`.
- **Каталог.** `catalog:sync` обновляет manifest источника (`global_vault/<sourceId>/.manifest.json`, TTL 30 с, `inFlight`, etag) и эмитит `source:synced`; `libs:sync` и `binds:sync` довозят локальные копии до manifest - другая операция. Без аргумента `sourceId` каналы `*:list` и `*:sync` работают по всем источникам.
- **Шрифты.** Только win32: реестр HKCU и `%LOCALAPPDATA%\Microsoft\Windows\Fonts`, индекс установленных шрифтов под mutex. Установка идёт после каждого `source:synced`; reconcile при старте убирает записи источников, которых нет в списке источников, и только по успешно прочитанному списку.
- **Скрипты.** `scripts:run` запускает `.ahk` через cmd после `cmd.allows(path)`; небезопасный путь - статус `error` через событие. `scripts:processes:get` сверяет свои процессы с ОС (PowerShell), `processes:clear` убивает все процессы `AutoHotkey*`. Запущенные скрипты при выходе не гасятся.
- **Границы.** Каждый аргумент канала, уходящий в FS, процесс или сеть, - схема `schema.*` (`source.id`, `file.name`, `config.path`, `script.id`, ...); путь внутри `global_vault` - `fsx.confine`. Тексты ошибок main английские.

### События

| Событие | Нагрузка | Эмитит |
|---|---|---|
| `source:changed` | `{ sourceId, type: 'add' \| 'update' \| 'remove' }` | `sources` |
| `source:synced` | `SourceSync` | `catalog` |
| `lib:changed`, `bind:changed` | `{ sourceId, libId \| presetId }`, `'*'` - все элементы источника | `libs`, `binds` |
| `script:changed` | `{ type: 'change' \| 'unlink', filePath }` | `scripts` (watcher, дебаунс 150 мс) |
| `script:status:changed` | `{ id, status, errorMessage? }` | `scripts` |
| `github:limit:changed` | `{ remaining, reset }` | `github` |
| `updater:*` | `checked`, `available`, `progress`, `downloaded`, `failed` | `updater` |

Все события - broadcast. Идентификатор источника в args и payload везде `sourceId`, скрипта - `id`.

## Shared (`shared/` - main+renderer)

```
shared/                   # @shared/
  config.ts               # `CONFIG`: appId, productName, feeds { latestUrl, betaUrl } - единственный редактируемый конфиг
  settings.ts             # zod-схема settings: источник типа и дефолтов (у каждого ключа .default()): theme, locale, telemetryOptIn, updaterBeta
  schema.ts               # namespace `schema`: общие zod-схемы аргументов каналов (nonEmpty, token, addSource, updateSource, `source.id`, `script.id`, `script.values`, `preset.values`, `file.name`, `config.path`)
  cmd.ts                  # namespace `cmd`: единственный набор метасимволов cmd (`allows`); от него `schema.file.name` и проверка пути запуска
  repo.ts                 # namespace `repo`: `parse` / `name` для ссылок на репозитории GitHub (нужен обоим процессам)
  types/
    ipc-channels.ts       # declare module '@cion-suite/core' { IpcChannelMap, IpcValueMap }
    app-events.ts         # declare module '@cion-suite/core' { EventMap }
    updater.ts            # типы обновления
    sources.ts scripts.ts script-deps.ts catalog.ts libs.ts binds.ts github.ts fonts.ts  # доменные типы каналов и событий
    index.ts              # публичные типы shared
```

`CONFIG` читает electron-builder (через jiti, без алиасов), поэтому `shared/config.ts` - без импортов, кроме `import type`. Инвариант `CONFIG.feeds` == `electron-builder.<channel>.json[publish[0].url]` держит `pnpm check:placeholders`.

### Event System

Правила событий - CLAUDE.md, раздел 3. Сверх них:

- События main -> renderer: `events.emit(name, payload, { target | except })`, имя и нагрузка типизированы `EventMap` (`shared/types/app-events.ts`). Renderer - `useEvent(name, handler)` или `events.on`.
- Renderer-only координация UI, в main не уходит, - стор с `subscribe` в своей сущности (`get` + `subscribe`, `useStored` для реактивного чтения). Сигналы, которые должен слышать main или другое окно, идут событием ядра, а не стором.
- У каждого окна свой renderer: состояние между окнами ходит событиями main или через `settings` (общий для окон, `set` / `patch` пишут в main).

## `@cion-suite/core` - три входа

> Пакет один, входов три (`cion-suite/packages/core/package.json`). Вход выбирает слой; ESLint-правило `@cion-suite/core/entries` (плагин `@cion-suite/core/eslint`, `core.configs.recommended` в `eslint.config.js`) держит границы: имена `events`, `logger`, `settings`, `errors` есть в нескольких входах, и чужой вход прошёл бы typecheck молча.

| Вход | Слой | Что берём |
|---|---|---|
| `@cion-suite/core` | `app/` (main) | `ipc`, `events`, `errors`, `logger`, `windows`, `http`, `settings`, `vault`, `kernel` |
| `@cion-suite/core/preload` | `app/preload.ts` | `bridge.expose()` |
| `@cion-suite/core/renderer` | `src/` | `events`, `useEvent`, `logger`, `settings` (синглтон), `useSetting(key)`, `state`, `useStored`, `errors`, `kernel`, `files`, `windows`, `useCloseRequest`, типы `EventName`, `SettingsMap`, `ModuleStatus` |

- `shared/` - только `import type` (`declare module '@cion-suite/core'` дополняет `IpcChannelMap`, `IpcValueMap`, `EventMap` и `Register` (схема settings, `shared/settings.ts`), дополнение доходит до `/preload` и `/renderer`).
- `src/` берёт только вход `@cion-suite/core/renderer`, в том числе типы (`EventName`, `SettingsMap`): корень и `/preload` запрещены и как `import type`.
- Карта API ядра - `cion-suite/docs/api-reference.md`; правила модулей - `cion-suite/packages/core/src/<модуль>/CLAUDE.md`.

**Подтверждённые исключения (намеренные, не gap):**
- **типизированный `window.*` preload facade** - `app/preload.ts` строит per-namespace bridge через `bridge.expose()` из `@cion-suite/core/preload`: фасад выводится из имён каналов `IpcChannelMap` (`shared/types/ipc-channels.ts`), имя канала = путь `window.<ns>.<m>`; типы `window.*` ядро дополняет само (`Window extends Facade` в `/renderer`), своего `window.d.ts` нет. Renderer-вход ядра `ipc` не экспортирует: каналы зовутся только через `window.<ns>.*`. Значения main для renderer - `IpcValueMap`, main отдаёт их в `kernel.run({ values })`.
- **Единый HTTP-транспорт** - весь HTTP main-процесса идёт через `http` / `http.create` ядра (`net.fetch` с явной политикой: `credentials: 'omit'`, `redirect: 'error'`, таймаут 30 с). Голый `fetch`, `net` из `electron` и сторонние HTTP-клиенты запрещены ESLint `primitives` ядра. Исключение: electron-updater (свой `net.request`, код библиотеки).

## Уровни хранения

Четыре уровня, у каждого одно имя - в документах, в ядре и в приложении.

| Уровень | Что | Ядро (фабрика) | Приложение (экземпляр) | Где лежит | Кто видит |
|---|---|---|---|---|---|
| **CONFIG** | развёртывание, только чтение | - | `CONFIG` (`shared/config.ts`) | бандл | все |
| **settings** | выбор пользователя: тема, локаль, канал обновлений | `settings.configure({ schema })` - синглтон | `settings` из `@cion-suite/core` (main) и `@cion-suite/core/renderer`; схема - `shared/settings.ts` | `<app name>-settings` (electron-store) | main и все окна; `set` / `patch` в main синхронные и бросают `validation`, в renderer асинхронные (`Promise<boolean>`, не reject) |
| **state** | след интерфейса: фильтры, вкладки, последний раздел, раскладка | `state.create({ defaults, storage? })` (renderer) | `state` (`localStorage`) - `src/lib/state.ts` | storage окна, ключи `state:*` | `state` - все окна (один origin `file://`, без синхронизации, последняя запись побеждает); `set` / `patch` синхронные, реактивное чтение - `useStored(store, key)` |
| **vault** | секреты (шифрует `safeStorage`) | `vault` - синглтон | `vault` из `@cion-suite/core`: `get` / `set` / `delete`, все `Promise` | `<app name>-secure` | только main |

`<app name>` - `app.getName()`; в warden это `CONFIG.appId` (`app.setName` в `app/main.ts`), то есть `io.cion.warden`.

- **settings или state.** settings - то, что пользователь выбирает осознанно и что нужно main или нескольким окнам. state - след интерфейса, который переживает перезапуск (`state`).
- **Домашний файл уровня.** `settings` и `vault` - синглтоны ядра: домашнего файла и фабрики нет, код импортирует их из `@cion-suite/core` (main) или `@cion-suite/core/renderer` (settings). Схему settings один раз регистрирует `settings.configure({ schema })` в `app/main.ts` ДО `kernel.run`, типы - `Register` в `shared/settings.ts`; снимок настроек приходит в preload через `__cion:boot`. Фабрика есть только у `state`: `state.create` вызывает один файл, `src/lib/state.ts`, наружу уходит экземпляр `state`. Фабрика импортируется под псевдонимом `coreState`: два объявления одного имени в модуле не компилируются. Остальной код импортирует экземпляр.
- Свои electron-store, ручные `localStorage`-обёртки и plaintext-секреты запрещены.

**Данные warden на диске.** Корень - `userData` = `%APPDATA%\@cion-suite\warden`, закреплён `paths.userData()` и `app.setPath` в `app/main.ts`; имя приложения закреплено `app.setName(CONFIG.appId)` до первого обращения к `vault` и `settings`. Всё остальное - только через `paths`:

```text
<userData>/
  sources.json                      источники, без токенов
  global_vault/<sourceId>/          локальная копия источника
    scripts/ scripts/cfg/ lib/ presets/
    .manifest.json .local-cache.json
  installed-fonts.json              индекс шрифтов (плюс реестр HKCU и %LOCALAPPDATA%\Microsoft\Windows\Fonts)
  io.cion.warden-settings.json      settings ядра
  io.cion.warden-secure.json        vault ядра: PAT источников, ключ source:token:<sourceId>
```

Значения из localStorage старого UI (`cion-warden:lang`, `cion-warden:sidebar-open`, `cion-warden:last-route`, `theme`) разово переносит `migrateLegacyState` в `src/lib/state.ts` (до `initI18n`): язык и тема - в settings, раздел и сайдбар - в state; старые ключи удаляются.

## Renderer (`src/`)

Раскладка - `docs/standard.md` (эталон), правила импортов и связывание kit с сущностями - CLAUDE.md, раздел 3. Карты файлов здесь нет: она устаревает быстрее кода. Вместо неё:

- дерево сущности или модуля - `git ls-files src/entities/<e>`, `git ls-files src/kit/<m>`; оболочка - `git ls-files src/shell`;
- где объявлен символ - `node .claude/scripts/map.mjs <имя>`;
- кто импортирует файл и что он тянет - `node .claude/scripts/graph.mjs deps <путь>`;
- зоны агентов - `.claude/agents/README.md`.

### Сущности и части

Четыре сущности - `src/entities/source`, `src/entities/script`, `src/entities/library`, `src/entities/bind`; ни у одной нет ядра (файлов в корне) и корневого `index.ts`: общего у частей нет, сущность без ядра разрешена стандартом. Экран маршрута - `<X>Page.tsx` в части.

| Сущность | Части | Экран / что делает |
|---|---|---|
| `source` | `manage`, `sync` | `manage`: `SourcesButton` и диалог источников (список, форма, токен, переустановка шрифтов); `sync`: `useSourcesSync` (синхронизация всех источников) |
| `script` | `list`, `catalog`, `values`, `deps` | `list`: `ScriptsPage` (раздел Scripts, запуск и остановка); `catalog`: `GetScriptsPage` (удалённые скрипты, установка и обновление); `values`: диалог хоткеев и значений скрипта; `deps`: проверка и установка недостающих lib и пресетов перед запуском |
| `library` | `list` | `LibrariesPage` (lib из всех источников) |
| `bind` | `grid`, `form` | `grid`: `BindsPage` (карточки пресетов); `form`: форма значений пресета |

Наружу из сущностей выходят только `source/manage` (`SourcesButton`) и `source/sync` (`useSourcesSync`): их импортируют `script/catalog`, `library/list`, `bind/grid`. Остальные части зовут каналы напрямую (`script/deps` ставит lib и пресеты через `window.libs.install` и `window.binds.install`, не импортируя `library` и `bind`).

### Оболочка, kit, ui, lib

- `src/shell/`: `layout` (каркас, `useQuerySync`, `windows.ready()`), `navbar` (крошки, слот страницы, провайдер), `sidebar` (таблица разделов `sections.ts`: Scripts, Get Scripts, Libraries, Binds, Changelog, Settings), `command` (палитра), `settings` (карточки Appearance, Language, GitHub API, Updates), `update` (updater из шаблона, экран `changelog`).
- `src/kit/catalog-actions` - действия над элементами каталога (install, remove, openFolder, sync с тостами и инвалидацией); `library` и `bind` отличаются только конфигом (каналы, префикс i18n, список инвалидаций).
- `src/ui/`: списки (`ListPanel`, `ListRow`), `ConfirmDialog`, `InfoTip`, `KeyBindInput`, `useNavbarSearch`, `useGithubToast`, `toast` и прочие generic-компоненты.
- `src/lib/`: `state.ts` (след интерфейса и миграция localStorage), `github-error.ts` (`githubFailure`), `hooks/` (`useQuerySync`, `useInvalidate`, `useBusy`), `navbar/` (контекст слота и крошек для страниц), `i18n/`.

### Данные и инвалидация

Запросы - react-query, ключ `[путь канала, ...аргументы]`; `staleTime` 30 с (`AppProvider`). Отступления: `scripts:processes:get`, `scripts:config:get` и `github:limit:get` читаются на каждый mount (`staleTime: 0`) - внешние процессы AutoHotkey и правки файла событий не дают. События main сбрасывают кэш в одном месте, `useQuerySync` (вызывается в `Layout`):

| Событие | Что сбрасывается |
|---|---|
| `source:synced` | `libs:list`, `binds:list`, `catalog:scripts:list` |
| `source:changed` | `sources:list`, три списка выше, `binds:schema:get`, `binds:values:get` |
| `lib:changed` | `libs:list` |
| `bind:changed` | `binds:list`, `binds:schema:get`, `binds:values:get` |
| `script:changed` | `scripts:list`, `scripts:processes:get`, `catalog:scripts:list` |
| `script:status:changed` | статус в кэше `scripts:list`, `scripts:processes:get` |
| `github:limit:changed` | `github:limit:get` |

После мутации хук сам зовёт `useInvalidate`, не дожидаясь события (main не каждое изменение эмитит). Исход операции - `toast.result`; для GitHub-операций - `useGithubToast`: `unauthorized` -> `sources.tokenInvalid`, `forbidden` -> `sources.tokenNoAccess`, `not_found` со `status` 404 -> `sources.repoNotFound`, прочее - общая фраза и текст main.

## Версии и лог

Лог для пользователей - markdown-файлы `docs/versions/`; пишет их только `/notes`, читает приложение и CI. Правила процесса (ветки, режимы `/notes`, порядок релиза) - CLAUDE.md, раздел 9; здесь - устройство.

```text
docs/versions/beta.md      лог бета-канала (версии с суффиксом)         пока пустой
docs/versions/release.md   лог релизного канала                         пока пустой
        |
        |-- /notes (.claude/scripts/notes.mjs write)    пишет разделы
        |-- app:  updater:changelog:get -> paths.changelog(file)        читает main, отдаёт строку | null
        |         dev: docs/versions/<file>
        |         пакет: resources/versions/<file>  <- extraResources в electron-builder.json
        '-- CI:   scripts/release-notes.mjs docs/versions/release.md <версия> -> текст GitHub Release
```

- **Формат.** Раздел `### Версия vX.Y.Z[-pre]`, буллеты `- текст`, новые разделы сверху, между ними `---`. Заголовок разбирают три места одним regex - `.claude/scripts/notes.mjs`, `scripts/release-notes.mjs`, `src/shell/update/changelog-filter.ts`; общего модуля нет, потому что CI и renderer `.claude/` не импортируют. Пустой файл - валидный лог.
- **Канал.** `updater:changelog:get` (`shared/types/ipc-channels.ts`, handler в `app/updater/updater.ts`, `window.updater.changelog.get()`) выбирает файл по `app.getVersion()`: суффикс `-` -> `beta.md`, иначе `release.md`. Файла нет (`ENOENT`) - `null`, прочие ошибки пробрасываются. `paths.changelog(file)` - единственный дом пути; запись `extraResources` (`docs/versions` -> `versions`, `*.md`) наследует и `electron-builder.beta.json`.
- **Экран.** Раздел сайдбара `#/changelog` ("Что нового", группа footer, `src/shell/sidebar/sections.ts`) - `src/shell/update/ChangelogPage.tsx`: `listChangelog(data, version)` (без версий новее установленной) как по Card на версию: текущая подсвечена, состояния Skeleton / Empty / Alert; запрос через react-query. Markdown рисует `src/ui/markdown` (`react-markdown` + `remark-gfm`, без подсветки кода; ссылки отключены, чтобы клик не уводил окно со страницы).
- **Диалог после обновления.** `PostUpdateChangelogDialog` в `Layout` (хук `usePostUpdateChangelog`): разделы в `(последняя показанная, текущая]` (`filterChangelog`), один раз. Последняя показанная версия - ключ state `lastShownChangelogVersion` (`src/lib/state.ts`). Первый запуск, откат версии и битое сохранённое значение - диалога нет, версия просто помечается показанной; ошибка чтения лога версию не помечает, повтор на следующем запуске.
- **Релиз из CI.** `.github/workflows/release.yml` запускается после зелёного CI на push в `main` (и вручную из `main`), права `contents: write`. Версия из `package.json`: с суффиксом или с уже существующим тегом `vX.Y.Z` - выход без действий; иначе раздел из `release.md` через `scripts/release-notes.mjs` (нет раздела или он пуст - job падает), аннотированный тег на `head_sha` и `gh release create`. Установщик в CI не собирается и на feed вручную: `pnpm dist` / `pnpm dist:beta`.

## Исключения

Места, где код сознательно отступает от `docs/standard.md` или CLAUDE.md, раздел 3. Раздел держим живым: новое отступление впиши сюда одной строкой с причиной (путь - что нарушено - почему иначе нельзя), код приведён к эталону - вычеркни.

- `app/` - нет `process.on('uncaughtException') -> app.exit(1)`: `process.on` в приложении запрещён, ядро только логирует и приложение живёт дальше. Старый fail-fast warden потерян.
- `app/main.ts` - в `ready()` ручная проверка `kernel.status(sourcesModule | catalogModule)` с `shell.splash.close()` и `throw errors.fail('unavailable', ...)`: ядро не роняет приложение при сбое модуля (каналы отвечают `unavailable`), а без источников и каталога warden бесполезен; так повторён старый fatal-старт.
- `app/main.ts` - имя приложения `app.setName(CONFIG.appId)` и `userData` закреплены до `settings.configure`: сторы `vault` и `settings` называются по `app.getName()`, и без закрепления токены и настройки старого warden (`io.cion.warden-secure`, `-settings`) не найдутся. Любая смена `appId` или пути в `paths.userData` осиротит все локальные данные.
- `app/updater` - нет `autoInstallOnAppQuit=false` + установки в `before-quit`: `before-quit` принадлежит ядру. Скачанное обновление ставит `stop()` модуля (`quitAndInstall`), только если оно скачано (флаг `downloaded`). Не проверено на живой сборке; запасной путь - кнопка `updater:install`.
- `app/updater` - надстройка над шаблоном (diff с эталоном ненулевой): лимит ручной проверки `updater:refresh` (5 мин между проверками, не более 4 в час, отказ `rate_limited`), флаг `downloaded` глушит плановые проверки и смену канала после скачивания, событие `updater:checked` на `update-not-available`. Потеряно: `UpdaterIpcResult` (ошибки теперь throw), `autoInstallOnAppQuit=false` как таковой.
- `app/scripts/module.ts` - `start` ловит сбой watcher (`try/catch` + `warn`): иначе модуль станет `failed` и все `scripts:*` ответят `unavailable`; без watcher список просто не обновляется сам.
- `app/fonts` - снятие шрифтов удалённого источника идёт по событию `source:changed` после записи списка источников (fire-and-forget), а не до неё: прямой вызов из `sources` замкнул бы цикл `sources` <-> `fonts`. Осиротевшие записи индекса убирает reconcile в `start`, и только по успешно прочитанному списку источников.
- Handler не бросает там, где отказ - данные: `github:limit:get` (сбой пробы в `entries[].ok / error`), `binds:schema:get` (`null`), `scripts:config:get` (`{}` без файла), `scripts:processes:get` (`false` при сбое PowerShell), `scripts:run` (небезопасный путь - статус `error` через событие), `sources:list` (сбой vault - `tokenMask: null`).
- Словарь глаголов не расширялся: остановка скрипта - `scripts:processes:remove`, остановка всех - `scripts:processes:clear`, проверка внешних - `scripts:processes:get`, проверка зависимостей - `scripts:deps:get`, `sync` у `libs` / `binds` - довести локальную копию до каталога (не то же, что `catalog:sync`, обновление manifest).
- `shared/types/updater.ts` - `UpdaterInfo`, `UpdaterProgress`: имена с `Info` против CLAUDE.md (тип результата - существительное без `Info`). Это нагрузки событий `updater:*`, а не результат канала, и файл общий с эталоном: имена шаблона оставлены, чтобы diff с ним был нулевым.
- `shared/settings.ts` - `theme` по умолчанию `dark` (шаблон: `system`), как в старом UI; в файле settings старого warden лежит `system`, поэтому `migrateLegacyState` явно ставит `dark` при апгрейде. Окно 900x450 (min 800x400), а не 1100x520 шаблона: размер старого warden, дальше `persist` ядра.
- `package.json` - `next-themes` не используется кодом приложения: его импортирует генерат `src/ui/shadcn/sonner.tsx`.
- Сохранённое поведение старого warden, не исправлялось ("попутно" не рефакторим): удаление источника не удаляет `global_vault/<id>`, а `scripts:list` показывает скрипты удалённого источника; `scripts:processes:clear` убивает все процессы `AutoHotkey*` в системе; запущенные скрипты не гасятся при выходе; id скрипта зависит от абсолютного пути; список источников - read-modify-write без блокировки; битый индекс шрифтов молча даёт пустой индекс.
- Placeholder: `CONFIG.feeds` и `publish[0].url` - `example.com`, иконки `public/assets` - шаблонные (CLAUDE.md, раздел 5).
