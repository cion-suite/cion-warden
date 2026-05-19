# Cion Warden — Design & Flow Plan

## Overview

Менеджер скриптов. Sidebar всегда присутствует (свёрнут или развёрнут). Четыре рабочие вкладки + настройки. Источники (Vault) — не отдельная вкладка, а конфигурируются через маленькую кнопку в тулбаре каждой вкладки и через Settings.

---

## Navigation (Sidebar)

```
Local
  └─ Scripts

Sources
  ├─ Get Scripts
  └─ Libraries

Misc
  └─ Binds

Settings
```

Иконки + подписи. Активный item — accent. Группы — muted-заголовки (не кликабельны).

---

## Sources Management (Vault)

**Не вкладка** — управляется через:
- Кнопка `🔌` / gear-иконка в тулбаре вкладок Get Scripts, Libraries, Binds
- Кнопка в Settings → секция "Sources"

Открывает **Sheet** (side-drawer) или отдельное окно со списком источников.

### Source Types

**Git Repository:**
- URL, branch (default: `main`)
- Private toggle → Personal Access Token (в `createSecureStorage` по id источника)
- Ожидаемая структура репо:
  ```
  scripts/        ← скрипты
  scripts/cfg/    ← JSON-конфиги
  lib/            ← библиотеки
  presets/        ← JSON-пресеты (если нет — игнорируем)
  ```

**External (Google Drive, etc.):**
- Name
- Scripts URL, Libs URL, Configs URL (3 прямых ссылки на папки/файлы)

**Default source** — один гит-репозиторий задаётся при первом запуске. Остальные — опциональные дополнительные источники. Все данные (Get Scripts, Libraries) — агрегат из всех источников.

### Sources Sheet/Window Layout

```
Sources                                [× Close]
─────────────────────────────────────────────────
  ● github.com/user/my-scripts   [Git]  [⚙] [✕]
  ● drive.google.com/...         [Ext]  [⚙] [✕]

  [+ Add Source]
```

---

## Page: Scripts

**Суть:** реалтайм список локальных скриптов из папки.

### Layout

```
┌───────────────────────────────────────────────────────┐
│  Scripts                        [Search]    [Refresh] │
│  Stop All                                             │
├───────────────────────────────────────────────────────┤
│  script-one                                           │
│  Modified: 04.05 22:38          [...] [⚙] [▷ Run]    │
├───────────────────────────────────────────────────────┤
│  script-two                                           │
│  Modified: 04.05 22:38          [...] [⚙] [⏹ Stop]   │
├───────────────────────────────────────────────────────┤
│  (empty state: drop scripts here or open folder)      │
└───────────────────────────────────────────────────────┘
```

### Row

- **Левая часть:** имя скрипта (bold) + мета (Modified: дата, или name/author/version из конфига)
- **Правая часть:** `...` menu → [Open in Explorer / Delete (confirm)] | `⚙` (конфиг) | `▷ Run` / `⏹ Stop`
- Run/Stop — одна кнопка, меняет label и действие

### Script Config Dialog

Открывается по `⚙`. Modal с табами:

**Tab: Hotkeys**
- Строки: `label | [key chip]`
- Клик на чип → режим записи → нажми клавишу → сохраняется

**Tab: Values**
- Строки: `label [?tooltip] | input`
- Типы: number input, text input, toggle
- `[Save]` внизу

Схема конфига — из `cfg/<scriptName>.json`. Если конфига нет — кнопка `⚙` disabled.

### Directory Watching

- Main: `chokidar.watch(scriptsDir)` → events `add/change/unlink`
- `appEvents.emitTo(win, 'scripts:changed', { type, filePath })`
- Renderer: `useAppEvent('scripts:changed', ...)` → обновляет список
- IPC `scripts:list` → `ScriptMeta[]` при монтировании

---

## Page: Get Scripts

**Суть:** агрегат доступных скриптов из всех источников. Скачать к себе с конфигом.

### Layout

```
┌───────────────────────────────────────────────────────┐
│  Get Scripts            [Search]  [🔌 Sources] [↺]    │
│  ⏱ Last sync: 04.05 22:18                             │
├───────────────────────────────────────────────────────┤
│  script-one                                           │
│  Modified: 04.05 22:13 | Author: dev   [...]  [↓ Get] │
├───────────────────────────────────────────────────────┤
│  script-two            (downloaded, update available) │
│  Modified: 04.05 22:13 | Author: dev   [...] [⚙][↓🔴]│
├───────────────────────────────────────────────────────┤
│  script-three          (downloaded, up to date)       │
│  Modified: 04.05 22:13 | Author: dev   [...]  [Manage]│
└───────────────────────────────────────────────────────┘
```

### Row states

| State | Action button |
|---|---|
| Не скачан | `[↓ Get]` |
| Скачан, актуален | `[Manage]` |
| Скачан, есть обновление | `[⚙ Manage]` + иконка обновления с красной точкой |

### `[↓ Get]` Flow

Скачивает скрипт + соответствующий `cfg/<name>.json` (если есть) → кладёт в `scriptsDir` / `scriptsDir/cfg/`.

### `[🔌 Sources]` Button

Открывает Sources Sheet (см. Sources Management).

---

## Page: Libraries

**Суть:** агрегат библиотек из всех источников. Скачать / обновить / удалить локально.

### Layout

```
┌───────────────────────────────────────────────────────┐
│  Libraries          [🔌 Sources]  [↓ Download All] [↺]│
│  ⏱ Last sync: 04.05 22:23                             │
├───────────────────────────────────────────────────────┤
│  FindText                                             │
│  Modified: 04.05 | Author: dev      [...]  [↓ Download│
├───────────────────────────────────────────────────────┤
│  headers                                              │
│  Modified: 04.05 | Author: dev      [...]  [↓ Update] │
├───────────────────────────────────────────────────────┤
│  json                                                 │
│  Modified: 25.03 | Author: dev      [...]  [↓ Update] │
├───────────────────────────────────────────────────────┤
│  key_decode        (downloaded, up to date)           │
│  Modified: 04.05 | Author: dev      [...]  [✓ Latest] │
└───────────────────────────────────────────────────────┘
```

### Row actions

- `[↓ Download]` — скачать в `libsDir`
- `[↓ Update]` — перезаписать локальный файл
- `[✓ Latest]` — disabled (актуально)
- `...` menu → [Open local folder] [Open in browser] [Delete local]

---

## Page: Binds

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

---

## Data Model

```typescript
// shared/types/scripts.ts
interface ScriptMeta {
  id: string;           // hash от filePath
  name: string;
  filePath: string;
  configPath?: string;
  config?: ScriptConfig;
  status: 'idle' | 'running' | 'error';
  errorMessage?: string;
}

interface ScriptConfig {
  name?: string;
  author?: string;
  version?: string;
  fields?: ConfigField[];
}

interface ConfigField {
  key: string;
  label: string;
  type: 'hotkey' | 'number' | 'text' | 'toggle';
  default?: unknown;
  description?: string;
}

// shared/types/vault.ts
type VaultSourceType = 'git' | 'external';

interface GitVaultSource {
  id: string;
  type: 'git';
  name: string;
  url: string;
  branch: string;
  isPrivate: boolean;
}

interface ExternalVaultSource {
  id: string;
  type: 'external';
  name: string;
  scriptsUrl: string;
  libsUrl: string;
  cfgUrl: string;
}

// shared/types/libs.ts
interface LibraryMeta {
  id: string;
  name: string;
  sourceId: string;
  modifiedAt?: string;
  author?: string;
  webUrl?: string;
  localPath?: string;
  isDownloaded: boolean;
  hasUpdate: boolean;
}

// shared/types/presets.ts
interface PresetSchema {
  title: string;
  fields: ConfigField[];
}

interface PresetValues {
  [key: string]: unknown;
}
```

---

## IPC Contracts

```
scripts:list          → ScriptMeta[]
scripts:delete        (filePath) → void
scripts:run           (id) → void
scripts:stop          (id) → void
scripts:open-folder   → void

sources:list          → VaultSource[]
sources:add           (source) → VaultSource
sources:remove        (id) → void
sources:update        (id, patch) → VaultSource

get-scripts:list      → RemoteScriptMeta[]   // агрегат всех источников
get-scripts:download  (sourceId, name) → void
get-scripts:sync      → void

libs:list             → LibraryMeta[]
libs:download         (id) → void
libs:update           (id) → void
libs:delete           (id) → void
libs:open-local       (id) → void
libs:open-web         (id) → void

presets:list          → PresetInfo[]          // { name, fieldCount }
presets:get-schema    (name) → PresetSchema
presets:get-values    (name) → PresetValues
presets:set-value     (name, key, value) → void
presets:reset         (name) → void
presets:create        (name) → void
presets:delete        (name) → void
```

---

## App Events

```typescript
// shared/types/app-events.ts — augmentation BaseAppEventMap
interface BaseAppEventMap {
  'scripts:changed': { type: 'add' | 'change' | 'unlink'; filePath: string };
  'script:status-changed': { id: string; status: 'idle' | 'running' | 'error'; errorMessage?: string };
  'sources:sync-progress': { sourceId: string; done: number; total: number };
}
```

---

## FSD Placement

```
src/
├── pages/
│   ├── scripts/         ← ScriptsPage
│   ├── get-scripts/     ← GetScriptsPage
│   ├── libraries/       ← LibrariesPage
│   ├── binds/           ← BindsPage (cards или форма)
│   ├── preset-detail/   ← PresetDetailPage (sub-page от binds)
│   └── settings/        ← extend existing
│
├── widgets/
│   ├── app-sidebar/     ← extend: Local/Sources/Misc groups
│   ├── script-list/     ← список строк скриптов
│   ├── remote-list/     ← общий виджет строк для Get Scripts + Libraries
│   ├── preset-cards/    ← сетка карточек пресетов
│   ├── preset-form/     ← форма пресета (key chips + inputs)
│   └── sources-sheet/   ← Sheet управления источниками
│
├── features/
│   ├── script-runner/   ← run/stop + status events
│   ├── script-config/   ← диалог с табами Hotkeys/Values
│   ├── sources-manage/  ← add/edit/delete источников
│   ├── get-scripts-sync/ ← fetch + download remote scripts
│   ├── lib-manage/      ← download/update/delete libs
│   └── preset-edit/     ← set-value, reset, create, delete
│
├── entities/
│   ├── script/          ← ScriptMeta + useScripts()
│   ├── vault-source/    ← VaultSource + useSources()
│   ├── library/         ← LibraryMeta + useLibraries()
│   └── preset/          ← PresetInfo/Schema/Values + usePresets()
│
└── shared/
    └── types/
        ├── scripts.ts
        ├── vault.ts
        ├── libs.ts
        ├── presets.ts
        └── app-events.ts
```

---

## Settings — дополнения

Новая секция "Paths":
- Scripts folder (browse-кнопка)
- Libraries folder (browse-кнопка)
- Presets folder (browse-кнопка)

Новая секция "Sources": кнопка "Manage Sources" → открывает Sources Sheet.

Defaults через `app.getPath('userData')`:
- `<userData>/scripts/`
- `<userData>/lib/`
- `<userData>/presets/`

---

## Implementation Phases

### Phase 1 — Routing & Navigation
1. Роуты `/scripts`, `/get-scripts`, `/libraries`, `/binds`, `/binds/:presetName`
2. `app-sidebar`: группы Local / Sources / Misc + nav-items
3. Skeleton-страницы

### Phase 2 — Scripts Page
1. Main: chokidar watcher + IPC handlers
2. Entity `script/` + `useScripts()`
3. Widget `script-list/`
4. Feature `script-runner/`
5. Feature `script-config/` — диалог Hotkeys + Values

### Phase 3 — Sources Management
1. Entity `vault-source/` + settings store
2. Feature `sources-manage/` — add/edit/delete
3. Widget `sources-sheet/`

### Phase 4 — Get Scripts Page
1. IPC: fetch remote scripts list (aggregate)
2. Feature `get-scripts-sync/`
3. Widget `remote-list/` (shared с Libraries)

### Phase 5 — Libraries Page
1. IPC: fetch libs list + download/update/delete
2. Feature `lib-manage/`
3. Reuse `remote-list/` widget

### Phase 6 — Binds Page
1. IPC: presets CRUD
2. Entity `preset/`
3. Widget `preset-cards/` + `preset-form/`
4. Feature `preset-edit/`
5. Sub-route `/binds/:presetName`

### Phase 7 — Settings Paths + Sources button

---

## Verification

- `pnpm dev` → все 5 вкладок открываются без ошибок
- Scripts: добавить файл в папку → строка появляется без refresh; удалить → исчезает
- Run/Stop: кнопка меняется на Stop, при повторном нажатии — обратно Run
- Config dialog: открывается, hotkey chip перехватывает нажатие, Save сохраняет
- Sources Sheet: добавить Git-источник → закрыть → открыть Get Scripts → скрипты из репо видны
- Get Scripts: Download → файл появляется в scriptsDir → на Scripts-вкладке видна строка
- Libraries: Download → Update (при изменении) → Open local folder открывает проводник
- Binds: 1 пресет → сразу форма; 2+ → карточки → клик → форма → breadcrumb назад
- Key chip: клик → ввод клавиши → значение обновляется
- `pnpm typecheck` → 0 ошибок; `pnpm lint` → 0 FSD violations
