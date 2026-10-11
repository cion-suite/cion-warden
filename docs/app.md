# Cion Warden - дизайн и потоки

## Обзор

Менеджер скриптов. Sidebar всегда присутствует (collapsible icon mode). Шесть разделов: Scripts, Get Scripts, Libraries, Binds, Changelog, Settings.

Источники - не отдельный раздел. Ими управляют через кнопку `[Sources]` в тулбарах Get Scripts, Libraries и Binds; она открывает общий диалог источников (modal).

Устройство кода - `docs/architecture.md` (концерны main, сущности renderer), правила - `CLAUDE.md`, эталон раскладки `src/` - `docs/standard.md`.

---

## Навигация (Sidebar)

```text
Local
  Scripts          /scripts          FileCode2

Sources
  Get Scripts      /get-scripts      Download
  Libraries        /libraries        Library

Misc
  Binds            /binds            Keyboard

Footer (без заголовка группы)
  Changelog        /changelog        ScrollText
  Settings         /settings         Settings
```

Таблица разделов (сайдбар, шапка и роутер читают одну) - `src/shell/sidebar/sections.ts`; маршруты - `src/app/AppRouter.tsx`; корневой путь ведёт на последний открытый раздел (`state.lastRoute`, по умолчанию раздел Scripts).

Иконки + подписи. Активный item - accent. Группы - muted-заголовки, не кликабельны. В footer над меню раздела показывается блок обновления (`SidebarUpdate`).

---

## Источники (Sources)

**Не раздел** - общий диалог (`SourcesButton` -> `SourcesDialog`, часть `manage` сущности `source`), вызывается из тулбаров Get Scripts / Libraries / Binds. Источники - глобальный список, агрегируется всеми тремя разделами.

### Схема источника (Git-репозиторий)

- `url` (например `https://github.com/user/repo`); поддерживается только GitHub.
- `branch` (по умолчанию `main`).
- `name` - выводится из `url` (`repo.name`), вручную не задаётся.
- `isPrivate` - переключатель; Personal Access Token хранится в `vault` ядра (`vault.get/set/delete`, ключ `source:token:<sourceId>`). В списке источников на диске его нет, renderer его не получает.
- `tokenMask` - маска токена или `null` (токена нет), отдаётся renderer'у в `sources:list`; сам токен в renderer не уходит.
- Ожидаемая структура репозитория:

  ```text
  scripts/          скрипты (.ahk)
  scripts/cfg/      JSON-конфиги (имя совпадает со скриптом)
  lib/              библиотеки (файл или папка)
  presets/          пресеты биндов (JSON)
  assets/fonts/     шрифты источника (+ _fonts.json с описанием)
  ```

### Раскладка диалога (`SourcesDialog`)

Split-panel modal (`sm:max-w-3xl`, высота `min(520px, 100dvh - 2rem)`):

```text
+-----------------------------------------------------+
|  Sources                                            |  (sr-only title)
+--------------+--------------------------------------+
|  Sources     |  selected.name                       |
+--------------+--------------------------------------+
|  * repo-a    |  url     [_____________________]     |
|    GIT, lock |  branch  [_____________________]     |
|  * repo-b    |  private [o----]                     |
|    GIT       |  token   [**********][edit]          |  (если private)
|              |                                      |
+--------------+--------------------------------------+
|  [+ Add]     |                [Reinstall fonts][Save]|
+--------------+--------------------------------------+
```

- **Левая панель:** список источников. Каждый item - название + бейдж типа (`GIT`) + lock-иконка для private. Hover -> trash-кнопка справа.
- **Правая панель:**
  - Существующий источник -> `SourceSettings` (форма + Save + `Reinstall fonts`).
  - `[+ Add]` -> `NewSourcePanel` (форма нового источника; имя показывается как выводимое из URL).
- **Токен:** при `tokenMask !== null` поле токена блокируется и показывает маску. Карандаш разлочивает поле для нового значения. Токен пишется отдельным вызовом `sources:token:set` после `sources:add` / `sources:update`; при снятии `isPrivate` main удаляет токен сам.
- **Reinstall fonts:** `fonts:install(sourceId)`, итог тостом (`ok`, `skipped`, `failed`).
- **Пустой выбор:** placeholder "Select a source".
- Первый запуск: main создаёт источник по умолчанию, если списка источников ещё нет (seed).

### Синхронизация и GitHub

- Кнопка refresh на страницах Get Scripts / Libraries / Binds - `catalog:sync()` по всем источникам: обновляется manifest (дерево репозитория, sha файлов), после чего списки перечитываются.
- Ошибки GitHub показываются фразой по коду: токен недействителен (`unauthorized`), у токена нет доступа (`forbidden`), репозиторий не найден (`not_found` со статусом 404); прочее - общая фраза и текст main.
- Лимит GitHub API по каждому токену - карточка GitHub API в Settings (`github:limit:get`), обновляется после каждой синхронизации (`github:limit:changed`).
- После успешной синхронизации источника шрифты из `assets/fonts/` устанавливаются в профиль пользователя (только Windows, реестр HKCU); при удалении источника шрифты снимаются.

---

## Страница: Scripts

**Суть:** локальные скрипты из `global_vault/<sourceId>/scripts`. Run/Stop, конфиг, удаление.

### Раскладка

Экран `ScriptsPage` (`src/entities/script/list`). Поисковая строка инжектится в navbar (`useNavbarSearch`). Список - `ListPanel` с прокруткой под тулбаром.

```text
+-------------------------------------------------------+
|  [navbar: ........................ [search]    ]       |
+-------------------------------------------------------+
|  [Stop All]                                    [R]    |
+-------------------------------------------------------+
|  script-one                                           |
|  Modified: 04/05 22:38     [...] [cfg] [> Run]        |
+-------------------------------------------------------+
|  script-two                              (running)    |
|  Modified: 04/05 22:38     [...] [cfg] [# Stop]       |
+-------------------------------------------------------+
```

### Тулбар

- `[Stop All]` - `outline`, disabled если нет запущенных (`scripts:processes:get`). Вызывает `scripts:processes:clear` (убивает все процессы AutoHotkey) и перечитывает признак.
- `[R]` - refresh: `scripts:list` + `scripts:processes:get`.

### Строка (`ScriptRow`)

- **Слева:** `name` (semibold, truncate) + `Modified: MM/DD HH:MM` (если есть `modifiedAt`).
- **Справа (группа):**
  - `[...]` dropdown:
    - `Open in Explorer` -> `scripts:folder:open`
    - `Delete` (destructive) -> confirmation Dialog -> `scripts:delete`
  - `[cfg]` - ghost icon. Disabled если нет `configPath`. Открывает `ScriptConfigDialog`.
  - `[> Run] / [# Stop]` - одна кнопка, зависит от `script.status === 'running'`. Run = `default`, Stop = `secondary` (`scripts:processes:remove`).
- **Индикатор состояния:** `border-primary/30` при running; при проверке зависимостей - спиннер и подпись.

### Запуск и зависимости (`deps`)

Перед `scripts:run` renderer зовёт `scripts:deps:get(id)`: main разбирает `#Include` скрипта (`ahk.includes`) и ищет недостающие lib и пресеты в manifest источника. Если чего-то не хватает, показывается `MissingLibsDialog` (список, прогресс): подтверждение последовательно ставит `libs:install` / `binds:install`, затем скрипт запускается; отказ части установок - тост с числом ошибок, запуск не происходит.

### Диалог конфига (`ScriptConfigDialog`, часть `values`)

Modal (`max-w-sm`) с двумя табами:

- **Hotkeys** (`hk` из `ScriptCfgFile`): label + опциональный `[?]` tooltip + `KeyBindInput` (chip с режимом записи клавиши или кнопки мыши).
- **Values** (`val`): label + tooltip + input по типу (`boolean` - Switch, `number` - numeric Input, `string` - text Input).

Default-таб - `hotkeys`, если есть `hk`-записи, иначе `values`. Disabled-таб, если соответствующих записей нет.

Сохранение: `scripts:config:save(configPath, values)` (файл `<cfg>.values.json`). Загрузка: `scripts:config:get(configPath)` при каждом открытии, мерж с дефолтами из `script.config`.

### Наблюдение за каталогом

- Main: `fs.watch(global_vault, { recursive: true })`, дебаунс 150 мс; событие `script:changed { type: 'change' | 'unlink', filePath }`.
- Renderer: `useQuerySync` сбрасывает `scripts:list`, `scripts:processes:get`, `catalog:scripts:list`.
- Статусы: `script:status:changed { id, status, errorMessage? }` обновляет строку в кэше без перечитывания списка.

### Сущность

- `src/entities/script/list` - `ScriptsPage`, `ScriptRow`, `useScripts` (список + признак запущенных).
- `src/entities/script/values` - диалог хоткеев и значений.
- `src/entities/script/deps` - проверка и установка недостающего перед запуском.

---

## Страница: Get Scripts

**Суть:** агрегат удалённых скриптов из всех источников. Download / Update / показ статуса.

### Раскладка

Экран `GetScriptsPage` (`src/entities/script/catalog`) + `SourcesButton`. Поиск - в navbar.

```text
+-------------------------------------------------------+
|  [navbar: ........................ [search]    ]       |
+-------------------------------------------------------+
|  [Sources]                                     [R]    |
+-------------------------------------------------------+
|  script-one                                           |
|  user/my-repo                            [v Get]      |
+-------------------------------------------------------+
|  script-two                                           |
|  user/my-repo            [Update available] [v Update]|
+-------------------------------------------------------+
|  script-three                                         |
|  user/my-repo                            [Up to date] |
+-------------------------------------------------------+
```

### Тулбар

- `[Sources]` - `outline`, открывает диалог источников.
- `[R]` - `catalog:sync()` по всем источникам, затем перечитывание списков; тост "готово" при непустом результате, ошибки GitHub - по коду (см. выше).

### Строка (`CatalogScriptRow`)

- **Слева:** `name` (semibold) + `sourceName` (muted).
- **Справа (группа):**
  - Бейдж `Update available` (`destructive`), если `hasUpdate`.
  - Кнопка действия:
    - `!isDownloaded` -> `[v Get]` (`default`)
    - `isDownloaded && hasUpdate` -> `[v Update]` (`outline`)
    - `isDownloaded && !hasUpdate` -> `[Up to date]` (`ghost`, disabled)

### Поток скачивания

`catalog:scripts:install(sourceId, fileName)` качает скрипт и соответствующий `cfg/<name>.json` (если есть в источнике) в `global_vault/<sourceId>/scripts` и `scripts/cfg`. Main событие не эмитит; renderer после успеха сбрасывает `catalog:scripts:list` и `scripts:list` (позже придёт `script:changed` от watcher). Тост успеха.

### Семантика синхронизации

- `sources:list` - текущие источники.
- `catalog:scripts:list()` - агрегат всех источников по сохранённому manifest; `catalog:scripts:list(sourceId)` - один источник.
- `catalog:sync(sourceId?)` - свежий листинг (GitHub API, etag, TTL 30 с) и пересчёт `sha` <-> `localSha`.

---

## Страница: Libraries

**Суть:** агрегат библиотек из всех источников. Download / Update / Delete локальных копий, bulk-download, `[...]` row-menu.

### Раскладка

Экран `LibrariesPage` (`src/entities/library/list`).

```text
+-------------------------------------------------------+
|  [navbar: ........................ [search]    ]       |
+-------------------------------------------------------+
|  [Sources]            [v Download All]         [R]    |
+-------------------------------------------------------+
|  FindText                                             |
|  user/my-repo                            [v Download] |
+-------------------------------------------------------+
|  headers                                              |
|  user/my-repo            [Update available] [v Update]|
+-------------------------------------------------------+
|  json                                                 |
|  user/my-repo                       [...] [v Update]  |
+-------------------------------------------------------+
|  key_decode                                           |
|  user/my-repo                       [...] [ok Latest] |
+-------------------------------------------------------+
```

### Тулбар

- `[Sources]` - общий диалог источников.
- `[v Download All]` - `outline`; `libs:sync()` качает lib всех источников; disabled, если нечего скачивать или идёт операция. Итог тостом (`ok` / `failed`).
- `[R]` - `catalog:sync()`, как в Get Scripts.

### Строка (`LibraryRow`)

- **Слева:** `name` (semibold) + `sourceName` (muted).
- **Справа (группа):**
  - Бейдж `Update available`, если `hasUpdate`.
  - `[...]` dropdown (только если `isDownloaded`):
    - `Open local folder` -> `libs:folder:open`
    - `Open in browser` -> `libs:web:open` (если есть `webUrl`)
    - `Delete local` (destructive, confirmation) -> `libs:delete`
  - Кнопка действия:
    - `!isDownloaded` -> `[v Download]` (`default`)
    - `isDownloaded && hasUpdate` -> `[v Update]` (`outline`)
    - `isDownloaded && !hasUpdate` -> `[ok Latest]` (`ghost`, disabled)

Операции над lib и пресетами (install / remove / openFolder / sync, тосты, занятые строки, инвалидация) общие для Libraries и Binds: модуль `src/kit/catalog-actions`, различия - конфигом.

---

## Страница: Binds

**Суть:** глобальные пресеты с биндами и значениями для скриптов. Пресеты - JSON-файлы источников (`presets/`), копии - в `global_vault/<sourceId>/presets`.

### Два режима

#### Режим A: один пресет и он скачан

Сразу показывает форму пресета (без сетки).

#### Режим B: иначе

Сетка карточек пресетов (`BindCard`) с тулбаром `[Sources]`, `[v Download All]` (`binds:sync()`), refresh. Карточка: имя; у скачанного - меню (Update при `hasUpdate`, open folder, delete), у нескачанного - кнопка Download. Пустой список - empty state.

```text
+-------------------------------------------------------+
|  Binds                          [Sources] [v Download]|
+-------------------------------------------------------+
|  +--------------+  +--------------+                   |
|  |  keybinds    |  |  hotkeys     |                   |
|  |  my-repo     |  |  my-repo     |                   |
|  +--------------+  +--------------+                   |
+-------------------------------------------------------+
```

Клик по скачанной карточке -> форма пресета; назад - через крошку в navbar (`Binds / name`).

```text
+-------------------------------------------------------+
|  Binds / keybinds                                     |
+-------------------------------------------------------+
|  +-------------------------------------------------+  |
|  |  keybinds                                       |  |
|  |  Attack         [  F1  ]                        |  |
|  |  Defend         [  F2  ]                        |  |
|  |  Delay (ms)     [ 1000 ]                        |  |
|  |                       [Reset]  [Save]          |  |
|  +-------------------------------------------------+  |
+-------------------------------------------------------+
```

### Форма пресета (часть `form`)

- Секции и поля выводятся из JSON пресета: ключи верхнего уровня - секции, внутри пары `поле: значение`; тип поля - по значению по умолчанию (`boolean` - Switch, `number` - numeric Input, строка - hotkey `KeyBindInput`). Ключи с `$` пропускаются.
- Клик по `[F1]` -> chip в режиме "нажми клавишу" -> клавиша или кнопка мыши записываются в черновик.
- Изменения копятся в форме; `[Save]` (`binds:values:save`) пишет значения, которые отличаются от значений по умолчанию, в `<имя>.values.json` (вложенный формат); `[Reset]` (`binds:values:reset`) удаляет файл значений.
- Схема - `binds:schema:get` (`null`, если пресета нет на диске или в нём нет полей - показывается подсказка), значения - `binds:values:get`.

### Формат значений

Ключ значения в renderer - плоский `<section>.<field>`, на диске - вложенный объект `{ section: { field: value } }`. Допустимы только примитивы (`string | number | boolean`).

---

## Страница: Changelog

Раздел "Что нового" (`#/changelog`, `src/shell/update`): карточки версий из `docs/versions/<канал>.md` (`updater:changelog:get`), текущая версия подсвечена. После обновления один раз открывается диалог с разделами между прошлой показанной и текущей версией. Устройство - `docs/architecture.md`, раздел "Версии и лог".

---

## Страница: Settings

Экран `SettingsPage` (`src/shell/settings`), стек карточек:

- **Appearance** - тема (`light` / `dark` / `system`, по умолчанию `dark`), `settings.theme`.
- **Language** - язык интерфейса (`en` / `ru`), `settings.locale`.
- **GitHub API** - лимит запросов по каждому сохранённому токену и анонимный (`github:limit:get`), прогресс-бар, время сброса; ручной refresh. Сбой пробы одного токена - строка с ошибкой, не отказ карточки.
- **Updates** - версия приложения, канал (latest / beta, `settings.updaterBeta`), проверка обновлений, загрузка и установка. Ручная проверка ограничена: не чаще раза в 5 минут и 4 раз в час.

Планируется (в коде нет): пути папок скриптов и библиотек (browse-кнопки), кнопка `Manage Sources`.

---

## Модель данных

Все интерфейсы - в `shared/types/` (видны main и renderer через `@shared/types`); источник правды - файлы, ниже только форма.

```ts
// shared/types/sources.ts
export interface Source {
    id: string;
    type: 'git';
    name: string;
    url: string;
    branch: string;
    isPrivate: boolean;
    tokenMask: string | null; // маска токена, сам токен в renderer не уходит
}
```

```ts
// shared/types/scripts.ts
export type ScriptStatus = 'idle' | 'running' | 'error';

export interface ScriptCfgFile {
    $version?: number;
    hk?: Record<string, HkEntry>;
    val?: Record<string, ValEntry>;
}

export interface ScriptCfgValues {
    hk: Record<string, string>;
    val: Record<string, string | number | boolean>;
}

export interface Script {
    id: string; // sha1(путь).slice(0, 16)
    name: string;
    filePath: string;
    configPath?: string;
    config?: ScriptCfgFile;
    status: ScriptStatus;
    errorMessage?: string;
    modifiedAt?: number;
}
```

```ts
// shared/types/catalog.ts
export interface CatalogScript {
    id: string;
    name: string;
    fileName: string;
    sourceId: string;
    sourceName: string;
    sha?: string;
    localSha?: string;
    isDownloaded: boolean;
    hasUpdate: boolean;
    downloadUrl?: string;
}

export interface SourceSync {
    sourceId: string;
    lastSyncedAt: number;
    fromCache: boolean; // TTL-попадание или 304
}
```

`Lib` (`libs.ts`: `kind: 'file' | 'folder'`, `files`, `webUrl`), `Bind` и `PresetSchema` / `PresetValues` (`binds.ts`), `ScriptDeps` (`script-deps.ts`: `missing`, `unknown`), `GithubLimit` и `GithubRepo` (`github.ts`), `Font` и `FontInstall` (`fonts.ts`) - по тем же правилам.

---

## IPC-контракты

Имя канала = путь в `window` (`'scripts:processes:get'` -> `window.scripts.processes.get()`); канал объявляется один раз в `shared/types/ipc-channels.ts`, обработчики - карты `handlers` концернов `app/<концерн>/handlers.ts` (бросают ошибки, аргументы описаны zod-схемами `shared/schema.ts`). Главный список с типами - `IpcChannelMap`.

```text
// scripts (локальные)
scripts:list                  ()                    -> Script[]
scripts:run                   (id)                  -> void
scripts:delete                (filePath)            -> void
scripts:processes:get         ()                    -> boolean          // есть ли запущенные
scripts:processes:remove      (id)                  -> void             // остановить скрипт
scripts:processes:clear       ()                    -> void             // остановить все
scripts:folder:open           (filePath)            -> void
scripts:config:get            (configPath)          -> Partial<ScriptCfgValues>
scripts:config:save           (configPath, values)  -> void
scripts:deps:get              (id)                  -> ScriptDeps

// sources
sources:list                  ()                    -> Source[]
sources:add                   (options)             -> Source
sources:update                (sourceId, options)   -> Source
sources:remove                (sourceId)            -> void
sources:token:set             (sourceId, token)     -> void
sources:token:remove          (sourceId)            -> void

// github
github:limit:get              ()                    -> GithubLimit
github:repo:get               (sourceId)            -> GithubRepo       // репозиторий глазами токена

// catalog (удалённые скрипты и синхронизация)
catalog:sync                  (sourceId?)           -> SourceSync[]
catalog:scripts:list          (sourceId?)           -> CatalogScript[]
catalog:scripts:install       (sourceId, fileName)  -> void

// libs
libs:list                     (sourceId?)           -> Lib[]
libs:install                  (sourceId, libId)     -> void
libs:sync                     (sourceId?)           -> LibSync          // { ok, failed }
libs:delete                   (sourceId, libId)     -> void
libs:folder:open              (sourceId, libId)     -> void
libs:web:open                 (sourceId, libId)     -> void

// binds (пресеты)
binds:list                    (sourceId?)           -> Bind[]
binds:install                 (sourceId, presetId)  -> void
binds:sync                    (sourceId?)           -> BindSync
binds:delete                  (sourceId, presetId)  -> void
binds:folder:open             (sourceId, presetId)  -> void
binds:schema:get              (sourceId, presetId)  -> PresetSchema | null
binds:values:get              (sourceId, presetId)  -> PresetValues
binds:values:save             (sourceId, presetId, values) -> void
binds:values:reset            (sourceId, presetId)  -> void

// fonts (Windows)
fonts:list                    ()                    -> Font[]
fonts:install                 (sourceId)            -> FontInstall
fonts:remove                  (sourceId)            -> void

// updater
updater:refresh               ()                    -> void
updater:install               ()                    -> void
updater:changelog:get         ()                    -> string | null
```

Значение main -> renderer (синхронно): `window.app.env` (`IpcValueMap['app:env']`: `isDev`, `username`, `version`).

---

## События

Единый канал ядра. Main: `events.emit(name, payload)` (всем окнам). Renderer: `useEvent(name, handler)` / `events.on`. Типы - `EventMap` в `shared/types/app-events.ts`. **Никогда** `win.webContents.send()`.

```text
source:changed          { sourceId, type: 'add' | 'update' | 'remove' }
source:synced           SourceSync
github:limit:changed    { remaining, reset }
lib:changed             { sourceId, libId }            // libId '*' - все lib источника
bind:changed            { sourceId, presetId }         // presetId '*' - все пресеты источника
script:changed          { type: 'change' | 'unlink', filePath }
script:status:changed   { id, status, errorMessage? }
updater:checked         void                           // новее версии нет
updater:available       UpdaterInfo
updater:progress        UpdaterProgress
updater:downloaded      UpdaterInfo
updater:failed          { message }
```

Кэш react-query сбрасывает `useQuerySync` (таблица - `docs/architecture.md`, раздел "Данные и инвалидация").

---

## Размещение в коде

### Renderer (`src/`)

```text
src/
|-- app/                     AppRouter, AppProvider, стили
|-- shell/                   layout, navbar, sidebar, command, settings, update
|-- entities/
|   |-- source/   manage/ (SourcesButton, диалог), sync/ (useSourcesSync)
|   |-- script/   list/ (ScriptsPage), catalog/ (GetScriptsPage), values/, deps/
|   |-- library/  list/ (LibrariesPage)
|   `-- bind/     grid/ (BindsPage), form/ (PresetForm)
|-- kit/catalog-actions/     install / remove / openFolder / sync для library и bind
|-- ui/                      shadcn, ListPanel, ListRow, ConfirmDialog, KeyBindInput, toast, ...
`-- lib/                     state, i18n, hooks (useQuerySync, useInvalidate, useBusy), navbar, github-error
```

### Main (`app/`)

Концерны `shell`, `sources`, `github`, `catalog`, `fonts`, `libs`, `binds`, `scripts`, `updater`; описание, `needs` и владение каналами - `docs/architecture.md`, раздел Backend.

---

## Проверка

- `pnpm dev` -> шесть разделов открываются без ошибок.
- Scripts: добавление файла в папку источника -> строка появляется без refresh; удаление -> исчезает.
- Run/Stop: кнопка переключается; при ошибке скрипт получает `status: 'error'` + `errorMessage`; недостающие lib предлагаются к установке перед запуском.
- `Stop All` disabled, пока нет запущенных.
- Диалог конфига: открывается только при наличии `configPath`; hk-chip перехватывает нажатие; Save вызывает `scripts:config:save`.
- Диалог источников: add git (private + token) -> `sources:add` + `sources:token:set`; маска видна после reopen; разлоченный токен сохраняется заново.
- Get Scripts / Libraries / Binds: refresh -> `catalog:sync` по всем источникам; ошибки токена и доступа дают правильную фразу; Download -> строка переходит в "Up to date" / "Latest".
- Binds: Save пишет `<имя>.values.json`, Reset его удаляет.
- `pnpm typecheck` -> 0 ошибок; `pnpm lint` -> 0 нарушений boundaries; `pnpm test` зелёный.
