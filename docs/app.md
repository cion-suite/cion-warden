# Cion Warden — Design & Flow Plan

## Overview

Менеджер скриптов. Sidebar всегда присутствует (collapsible icon mode). Пять вкладок: Scripts, Get Scripts, Libraries, Binds, Settings.

Источники (Vault) — не отдельная вкладка. Управляются через кнопку `[🔌 Sources]` в тулбаре вкладок Get Scripts и Libraries; открывают общий `SourcesDialog` (modal).

---

## Navigation (Sidebar)

```
Local
  └─ Scripts          /scripts          FileCode2

Sources
  ├─ Get Scripts      /get-scripts      Download
  └─ Libraries        /libraries        Library

Misc
  └─ Binds            /binds            Keyboard

Footer
  └─ Settings         /settings         Settings
```

Конфиг навигации — `src/shared/config/nav.ts` (`NAV_BY_SECTION`). Роуты — `src/shared/config/routes.ts` (`ROUTES`). Sidebar — `src/widgets/app-sidebar/`.

Иконки + подписи. Активный item — accent. Группы — muted-заголовки, не кликабельны.

---

## Sources Management (Vault)

**Не вкладка** — общий `SourcesDialog` (modal), вызывается через `[🔌 Sources]` в тулбарах Get Scripts / Libraries. Источники — глобальный стейт, агрегируются обеими вкладками.

### Source Schema (Git Repository)

- `url` (e.g. `https://github.com/user/repo`)
- `branch` (default: `main`)
- `isPrivate` toggle → Personal Access Token хранится через `@cion-suite/core/storage` (`createSecureStorage`) по `sourceId`. Никогда не персистится в JSON.
- `hasToken` — computed-флаг, отдаётся renderer'у при `sources:list` из secure-store, без значения токена.
- Ожидаемая структура репо:
  ```
  scripts/        ← .ahk / .py / etc.
  scripts/cfg/    ← JSON-конфиги (имя совпадает со скриптом)
  lib/            ← библиотеки
  ```

### Dialog Layout (`SourcesDialog`)

Split-panel modal (`sm:max-w-2xl`, fixed `h-[min(520px,calc(100dvh-2rem))]`):

```
┌─────────────────────────────────────────────────────┐
│  Sources                                            │  (sr-only title)
├──────────────┬──────────────────────────────────────┤
│  Sources     │  selected.name                       │
├──────────────┼──────────────────────────────────────┤
│  • repo-a    │  url     [_____________________]     │
│    GIT · 🔒  │  branch  [_____________________]     │
│  • repo-b    │  private [○————]                     │
│    GIT       │  token   [••••••••••••][✎]           │  (если private)
│  ┌──────────┐│                                      │
│  │ NEW      ││                                      │
│  └──────────┘│                                      │
│              │                                      │
├──────────────┼──────────────────────────────────────┤
│  [+ Add]     │                          [Save]      │
└──────────────┴──────────────────────────────────────┘
```

- **Left panel:** список источников. Каждый item — название + бейдж типа (`GIT`/`EXTERNAL`) + lock-иконка для private. Hover → trash-кнопка справа.
- **Right panel:**
  - Существующий источник → `GitSettings` / `ExternalSettings` (форма + Save).
  - `[+ Add]` → `NewSourcePanel` с табами `Git` / `External`, форма соответствующего типа.
- **Token UX:** при `hasToken === true` поле `token` блокируется, показывается mask из `sources:get-token-mask`. Карандаш разлочивает поле для ввода нового значения.
- **Empty selection:** `"Select a source"` placeholder.

---

## Page: Scripts

**Суть:** локальные скрипты из watched-папки. Run/Stop, конфиг, удаление.

### Layout

Page (`src/pages/scripts/index.tsx`) монтирует `<ScriptList>`. Поисковая строка инжектится в navbar через `useSetNavbarSlot`.

```
┌───────────────────────────────────────────────────────┐
│  [navbar: ........................ [search]    ]      │
├───────────────────────────────────────────────────────┤
│  [Stop All]                                  [↻]      │
├───────────────────────────────────────────────────────┤
│  script-one                                           │
│  Modified: 04/05 22:38     [⋯] [⚙] [▷ Run]            │
├───────────────────────────────────────────────────────┤
│  script-two                            (running)      │
│  Modified: 04/05 22:38     [⋯] [⚙] [□ Stop]           │
└───────────────────────────────────────────────────────┘
```

### Toolbar (внутри page)

- `[Stop All]` — `outline`, disabled если `!hasAnyRunning`. Дёргает `scripts:stop-all` + `probeExternal`.
- `[↻]` — `ghost icon-sm`. Refresh + `probeExternal`.

### Row (`ScriptRow`)

- **Left:** `name` (semibold truncate) + `Modified: MM/DD HH:MM` (если есть `modifiedAt`).
- **Right (group):**
  - `[⋯]` dropdown:
    - `Open in Explorer` → `scripts:open-in-explorer`
    - `Delete` (destructive) → confirmation Dialog → `scripts:delete`
  - `[⚙]` — `ghost icon-sm`. Disabled если `!script.configPath`. Открывает `ScriptConfigDialog`.
  - `[▷ Run] / [□ Stop]` — одна кнопка, меняется по `script.status === 'running'`. Run = `default`, Stop = `secondary`.
- **State indicator:** `border-primary/30` при `isRunning`.

### Script Config Dialog (`ScriptConfigDialog`)

Modal (`max-w-sm`) с двумя табами:

- **Hotkeys** (`hk` из `ScriptCfgFile`): label + опциональный `[?]` tooltip + `<KeyBindInput>` (chip с режимом записи клавиши).
- **Values** (`val`): label + tooltip + input по типу (`boolean` → Switch, `number` → numeric Input w24, `string` → text Input w24).

Default-таб — `hotkeys` если есть `hk`-записи, иначе `values`. Disabled-таб если соответствующих записей нет.

Сохранение: `scripts:config-save-values(configPath, values)`. Загрузка: `scripts:config-get-values(configPath)`, мерж с дефолтами из `script.config`.

### Directory Watching

- Main: `chokidar.watch(scriptsDir)` → events `add` / `change` / `unlink`.
- `appEvents.emit('scripts:changed', { type, filePath })`.
- Renderer: `useScripts` слушает `scripts:changed` → refresh + `probeExternal`.
- Renderer: `useAppEvent('script:status-changed', ...)` → обновляет статус строки.
- IPC `scripts:list` при монтировании.

### Slices

- `entities/script/` — `useScripts()` (list + hasAnyRunning + probeExternal).
- `features/script-runner/` — `useScriptRunner()` (run/stop/stopAll).
- `features/script-config/` — `ScriptConfigDialog`.
- `widgets/script-list/` — `ScriptList` + `ScriptRow`.

---

## Page: Get Scripts

**Суть:** агрегат удалённых скриптов из всех источников. Download / Update / показ статуса.

### Layout

Page (`src/pages/get-scripts/index.tsx`) монтирует `<RemoteScriptList>` + `<SourcesDialog>`. Поиск — в navbar slot.

```
┌───────────────────────────────────────────────────────┐
│  [navbar: ........................ [search]    ]      │
├───────────────────────────────────────────────────────┤
│  [🔌 Sources]                                  [↻]    │
├───────────────────────────────────────────────────────┤
│  script-one                                           │
│  user/my-repo                            [↓ Get]      │
├───────────────────────────────────────────────────────┤
│  script-two                                           │
│  user/my-repo            [Update available] [↓ Update]│
├───────────────────────────────────────────────────────┤
│  script-three                                         │
│  user/my-repo                            [Up to date] │
└───────────────────────────────────────────────────────┘
```

### Toolbar

- `[🔌 Sources]` — `outline`. Открывает `SourcesDialog`.
- `[↻]` — `ghost icon-sm`. Запускает `handleSync`: параллельный `get-scripts:sync-source` по всем git-источникам через `Promise.allSettled`, затем `refresh()`. Тосты успех/ошибка (известные коды — `sources.tokenInvalid`, `sources.tokenNoAccess`, `sources.repoNotFound`).

### Row (`RemoteScriptRow`)

- **Left:** `name` (semibold) + `sourceName` (muted).
- **Right (group):**
  - Бейдж `Update available` (`destructive` variant) если `hasUpdate`.
  - Action button:
    - `!isDownloaded` → `[↓ Get]` (`default`).
    - `isDownloaded && hasUpdate` → `[↓ Update]` (`outline`).
    - `isDownloaded && !hasUpdate` → `[Up to date]` (`ghost`, disabled).

### Download Flow

`window.app.getScripts.download(sourceId, fileName)` качает скрипт + соответствующий `cfg/<name>.json` (если присутствует в источнике) в локальные `scriptsDir` / `scriptsDir/cfg/`. Renderer оптимистично патчит строку: `{ isDownloaded: true, hasUpdate: false, localSha: sha }`. Тост успеха.

### Sync Semantics

- `sources:list` — текущие источники.
- `get-scripts:list` — последний агрегат всех источников из persisted cache.
- `get-scripts:list-source(sourceId)` — кэш одного источника.
- `get-scripts:sync-source(sourceId)` — pull свежего листинга (GitHub API) + сравнение `sha` ↔ `localSha`.

### Slices

- `entities/remote-script/` — `useRemoteScripts()`.
- `entities/vault-source/` — `useVaultSources()`.
- `features/sources-manage/` — `SourcesDialog`.
- `widgets/remote-list/` — `RemoteScriptList` + `RemoteScriptRow`.

---

## Page: Libraries

**Суть:** агрегат библиотек из всех источников. Download / Update / Delete локальных копий. Зеркалит паттерн Get Scripts с дополнениями: bulk-download и `[⋯]` row-menu.

> **Status:** spec, не реализовано. Текущая страница — empty skeleton (`src/pages/libraries/index.tsx`).

### Layout

```
┌───────────────────────────────────────────────────────┐
│  [navbar: ........................ [search]    ]      │
├───────────────────────────────────────────────────────┤
│  [🔌 Sources]            [↓ Download All]      [↻]    │
├───────────────────────────────────────────────────────┤
│  FindText                                             │
│  user/my-repo                            [↓ Download] │
├───────────────────────────────────────────────────────┤
│  headers                                              │
│  user/my-repo            [Update available] [↓ Update]│
├───────────────────────────────────────────────────────┤
│  json                                                 │
│  user/my-repo                       [⋯] [↓ Update]    │
├───────────────────────────────────────────────────────┤
│  key_decode                                           │
│  user/my-repo                       [⋯] [✓ Latest]    │
└───────────────────────────────────────────────────────┘
```

### Toolbar

- `[🔌 Sources]` — общий `SourcesDialog` (reuse из get-scripts).
- `[↓ Download All]` — `outline`. Качает все ещё-не-скачанные библиотеки последовательно. Прогресс через тост + `libs:bulk-progress` event (опционально).
- `[↻]` — sync source listing (как get-scripts).

### Row (`RemoteLibraryRow`)

- **Left:** `name` (semibold) + `sourceName` (muted).
- **Right (group):**
  - `Update available` бейдж (если `hasUpdate`).
  - `[⋯]` dropdown (только если `isDownloaded`):
    - `Open local folder` → `libs:open-local`
    - `Open in browser` → `libs:open-web` (если `webUrl`)
    - `Delete local` (destructive, confirmation) → `libs:delete`
  - Action button:
    - `!isDownloaded` → `[↓ Download]` (`default`)
    - `isDownloaded && hasUpdate` → `[↓ Update]` (`outline`)
    - `isDownloaded && !hasUpdate` → `[✓ Latest]` (`ghost`, disabled)

### Slices (планируемые)

- `entities/remote-library/` — `useRemoteLibraries()`.
- `features/lib-manage/` — download/update/delete actions.
- `widgets/remote-list/` — добавить `RemoteLibraryList` / `RemoteLibraryRow` либо параметризовать существующий remote-list (общий `RemoteItemRow`).

---

## Page: Binds

> **Status:** skeleton (`src/pages/binds/index.tsx`). Спецификация ниже — план; реализация после Libraries.

**Суть:** глобальные пресеты с биндами и значениями для скриптов. Хранятся в `presetsDir`.

### Два режима в зависимости от количества пресетов

#### Режим A: 1 пресет (или пресетов нет)

Сразу показывает форму пресета. Если пресетов нет — empty state с `[+ Create Preset]`.

```
┌───────────────────────────────────────────────────────┐
│  Binds                              [🔌 Sources] [↺]  │
├───────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐  │
│  │  Базовые бинды                                  │  │
│  │  ─────────────────────────────────────────────  │  │
│  │  Прыжок-уклон          [  Space  ]              │  │
│  │  Подбор предметов       [  X  ]                 │  │
│  │  Активация ульты        [  4  ]                 │  │
│  │  Парейровать атаку      [  E  ]                 │  │
│  │                                  [↺ Сбросить]  │  │
│  └─────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────┘
```

#### Режим B: 2+ пресетов

Сначала сетка карточек:

```
┌───────────────────────────────────────────────────────┐
│  Binds                             [🔌 Sources]        │
├───────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐                   │
│  │  keybinds    │  │  hotkeys     │                   │
│  │  6 entries   │  │  4 entries   │                   │
│  └──────────────┘  └──────────────┘                   │
└───────────────────────────────────────────────────────┘
```

Клик по карточке → навигация на страницу пресета:

```
┌───────────────────────────────────────────────────────┐
│  ← Binds / keybinds                                   │
├───────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐  │
│  │  keybinds                                       │  │
│  │  ─────────────────────────────────────────────  │  │
│  │  Attack         [  F1  ]                        │  │
│  │  Defend         [  F2  ]                        │  │
│  │                                  [↺ Сбросить]  │  │
│  └─────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────┘
```

Назад — через breadcrumb `← Binds / name` или стрелку.

### Key Chip Interaction

Клик на `[Space]` → chip переходит в режим `[press key...]` → пользователь нажимает клавишу → chip обновляется → автосохранение.

### Preset Schema

Пресет — JSON с секциями:

```json
{
  "title": "Базовые бинды",
  "fields": [
    { "key": "jump", "label": "Прыжок-уклон", "type": "hotkey", "default": "Space" },
    { "key": "pickup", "label": "Подбор предметов", "type": "hotkey", "default": "X" },
    { "key": "delay", "label": "Pre-cast delay (ms)", "type": "number", "default": 1000 }
  ]
}
```

Значения хранятся отдельно (user values) рядом со схемой или в отдельном файле.

### Планируемые IPC

```
presets:list          () → PresetInfo[]          // { name, fieldCount }
presets:get-schema    (name) → PresetSchema
presets:get-values    (name) → PresetValues
presets:set-value     (name, key, value) → void
presets:reset         (name) → void
presets:create        (name) → void
presets:delete        (name) → void
```

### Планируемые типы

```ts
// shared/types/presets.ts
export interface PresetSchema {
    title: string;
    fields: ConfigField[];
}

export interface PresetValues {
    [key: string]: unknown;
}
```

---

## Data Model

Все интерфейсы — в `shared/types/` (видны и main, и renderer через alias `@shared/types`).

```ts
// shared/types/scripts.ts
export interface HkEntry {
    key: string;
    description: string;
    tooltip?: string;
}

export interface ValEntry {
    val: string | number | boolean;
    description: string;
    tooltip?: string;
}

export interface ScriptCfgFile {
    $version?: number;
    hk?: Record<string, HkEntry>;
    val?: Record<string, ValEntry>;
}

export type ScriptStatus = 'idle' | 'running' | 'error';

export interface ScriptCfgValues {
    hk: Record<string, string>;
    val: Record<string, string | number | boolean>;
}

export interface ScriptMeta {
    id: string;
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
// shared/types/get-scripts.ts
export interface RemoteScriptMeta {
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
```

```ts
// shared/types/vault.ts
export type VaultSourceType = 'git';

export interface GitVaultSource {
    id: string;
    type: 'git';
    name: string;
    url: string;
    branch: string;
    isPrivate: boolean;
    hasToken?: boolean; // computed at listSources, never persisted
}

export type VaultSource = GitVaultSource;
```

```ts
// shared/types/libs.ts  (планируется)
export interface RemoteLibraryMeta {
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
    webUrl?: string;
    localPath?: string;
}
```

---

## IPC Contracts

Бридж — `AppBridge` в `shared/types/ipc.ts`, экспонируется через `contextBridge` в `app/preload.ts`. Регистрация хендлеров — `registerHandlers(map)` из `@cion-suite/core/ipc`.

### Текущие каналы

```
// scripts
scripts:list                () → ScriptMeta[]
scripts:probe-external      () → { anyRunning: boolean }
scripts:run                 (id) → void
scripts:stop                (id) → void
scripts:stop-all            () → void
scripts:delete              (filePath) → void
scripts:open-in-explorer    (filePath) → void
scripts:config-get-values   (configPath) → Partial<ScriptCfgValues>
scripts:config-save-values  (configPath, values) → void

// sources (vault)
sources:list                () → VaultSource[]            // git items имеют hasToken
sources:add                 (Omit<VaultSource,'id'>) → VaultSource
sources:remove              (id) → void
sources:update              (id, patch) → VaultSource
sources:set-token           (id, token) → void
sources:remove-token        (id) → void
sources:test-token          (id) → { ok:true } | { ok:false; status; message }
sources:get-token-mask      (id) → string | null

// get-scripts
get-scripts:list            () → RemoteScriptMeta[]
get-scripts:list-source     (sourceId) → { scripts; lastSyncedAt? }
get-scripts:sync-source     (sourceId) → { scripts; lastSyncedAt }
get-scripts:download        (sourceId, fileName) → void

// system + updater (для контекста)
system:renderer-ready       () → void
errors:report               (ErrorReport) → void
updater:check-for-updates   () → UpdaterIpcResult
updater:quit-and-install    () → void
```

### Планируемые (Libraries)

```
libs:list                   () → RemoteLibraryMeta[]
libs:list-source            (sourceId) → { libs; lastSyncedAt? }
libs:sync-source            (sourceId) → { libs; lastSyncedAt }
libs:download               (sourceId, fileName) → void
libs:download-all           () → void                     // или возвращать summary
libs:delete                 (id) → void
libs:open-local             (id) → void
libs:open-web               (id) → void
```

---

## App Events

Единый канал `app:event`. Augmentation `BaseAppEventMap` — `shared/types/app-events.ts`. Main: `appEvents.emit(name, payload)` / `emitTo(win, ...)`. Renderer: `useAppEvent(name, handler)`. **Никогда** `win.webContents.send()`.

```ts
declare module '@cion-suite/core/ipc' {
    interface BaseAppEventMap {
        // updater
        'updater:available': UpdaterInfo;
        'updater:not-available': void;
        'updater:downloaded': UpdaterInfo;
        'updater:error': { message: string };
        'updater:progress': UpdaterProgress;
        'app:channel:changed': { isBeta: boolean };

        // scripts
        'scripts:changed': { type: 'add' | 'change' | 'unlink'; filePath: string };
        'script:status-changed': { id: string; status: ScriptStatus; errorMessage?: string };

        // планируется: 'libs:changed', 'libs:bulk-progress'
    }
}
```

---

## FSD Placement

### Текущая структура

```
src/
├── pages/
│   ├── scripts/          ← ScriptsPage (реализовано)
│   ├── get-scripts/      ← GetScriptsPage (реализовано)
│   ├── libraries/        ← skeleton
│   ├── binds/            ← skeleton
│   └── settings/         ← appearance + updater
│
├── widgets/
│   ├── app-layout/
│   ├── app-navbar/
│   ├── app-sidebar/      ← Local / Sources / Misc + footer
│   ├── script-list/      ← ScriptList + ScriptRow
│   └── remote-list/      ← RemoteScriptList + RemoteScriptRow
│
├── features/
│   ├── script-runner/    ← useScriptRunner (run/stop/stopAll)
│   ├── script-config/    ← ScriptConfigDialog
│   └── sources-manage/   ← SourcesDialog (git, token UX)
│
├── entities/
│   ├── script/           ← useScripts
│   ├── remote-script/    ← useRemoteScripts
│   └── vault-source/     ← useVaultSources
│
└── shared/
    ├── config/           ← nav.ts, routes.ts
    ├── i18n/             ← useT, locales
    ├── lib/              ← navbar-slot, toast, hooks, utils, local-storage, updater
    └── ui/               ← shadcn primitives + key-bind-input
```

### Планируемые добавления для Libraries

```
src/
├── pages/libraries/      ← реализовать LibrariesPage
├── widgets/remote-list/  ← добавить RemoteLibraryList + RemoteLibraryRow
│                          (либо обобщить в RemoteItemList/Row)
├── features/lib-manage/  ← download/update/delete/openLocal/openWeb
└── entities/remote-library/ ← useRemoteLibraries
```

`shared/types/libs.ts` — новый файл.

---

## Settings — план

Сейчас Settings содержит только Appearance (theme/locale) + Updates. Планируется добавить:

- **Paths** — Scripts folder / Libraries folder (browse-кнопки, persist через `@cion-suite/core/settings`).
- **Sources** — кнопка `Manage Sources` (дублирует вход из тулбаров вкладок).

Defaults через `app.getPath('userData')`:
- `<userData>/scripts/`
- `<userData>/lib/`

---

## Verification

- `pnpm dev` → 5 вкладок открываются без ошибок.
- Scripts: добавление файла в watched-папку → строка появляется без refresh; удаление → исчезает.
- Run/Stop: кнопка переключается, при ошибке скрипт получает `status: 'error'` + `errorMessage`.
- `StopAll` disabled до `hasAnyRunning`.
- Config dialog: открывается только при наличии `configPath`; hk-chip перехватывает нажатие; Save вызывает `scripts:config-save-values`.
- SourcesDialog: add git (private + token) → `sources:add` + `sources:set-token`; mask виден после reopen; Edit unlock → новый токен сохраняется.
- Get Scripts: refresh → `sync-source` по всем git-источникам; ошибки токена/доступа дают правильный i18n-ключ; Download → строка переходит в `up-to-date`.
- `pnpm typecheck` → 0 ошибок; `pnpm lint` → 0 FSD violations.
