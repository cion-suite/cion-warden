# Cion Stack — Architecture Reference

Глобальные правила архитектуры для всех приложений на Cion Suite. **Этот файл не правится под конкретный проект** — проектные детали (имена slice'ов, IPC-каналы, домен) живут в `CLAUDE.md` и `.claude/agents/`.

## Stack

- **Electron** (main + preload + renderer через `electron-vite`).
- **React 19** + React Compiler.
- **TypeScript 5+**, strict mode, `verbatimModuleSyntax`.
- **Tailwind v4** (CSS-first, `@theme inline`).
- **shadcn** (primitives управляются через CLI / skill `/shadcn`).
- **FSD** (Feature-Sliced Design) — ESLint `boundaries/dependencies`.
- **Cion Suite packages:** `@cion-suite/core` (window/ipc/storage/settings/log/crash/http), `@cion-suite/config`.

## Process layout

```
app/main.ts ──ipcMain.handle──► app/preload.ts ──contextBridge──► window.<bridge>
            ──appEvents.emit──►        (channel 'app:event')   ──useAppEvent──►
```

- **Main** (`app/`): композиция core-сервисов, IPC handlers, окна.
- **Preload** (`app/preload.ts`): `exposeAppEventsBridge()` + `contextBridge.exposeInMainWorld` с типизированным API.
- **Renderer** (`src/`): React + FSD slice'ы.

## FSD direction

```
app → pages → widgets → features → entities → shared
```

Каждый слой импортирует **только правый**. Соседи на одном слое не импортируют друг друга. ESLint `@cion-suite/config/eslint/fsd` фиксирует через `boundaries/dependencies`.

### Layer responsibilities

| Layer | Что | Импортирует |
|---|---|---|
| `app/` | composition root: providers, routes, side-effect баррели, global styles | всё |
| `pages/` | route-level wrapper, один маршрут = одна папка | widgets, features, entities, shared |
| `widgets/` | композиция features+entities в крупный UI-блок (table, profile, layout) | features, entities, shared |
| `features/` | один user-сценарий (модалка, форма, мутация). `api/ + model/ + ui/` | entities, shared |
| `entities/` | доменный UI сущности: display-компоненты, types, DataProvider, picker-config | shared |
| `shared/` | инфраструктура без доменной логики: `ui/`, `lib/`, `api/`, `config/`, `types/` | shared |

### Critical FSD rules

1. **`features/<X> → features/<Y>` запрещено.** Cross-feature — через runtime-registry в `src/shared/lib/registry/`.
2. **`app` не импортирует `features/**` / `entities/**` напрямую** — только через `pages/`, `widgets/`, registry.
3. **`widgets → features`** — единственное место.
4. **`shared/ui/`** хранит generic-фреймворки (config-driven) — НЕ импортирует `entities/features`.

## Cross-process (`shared/` at repo root)

Используется и main, и renderer. Алиас `@shared/*`. Включён в обоих tsconfig'ах (`tsconfig.front.json` + `tsconfig.back.json`).

```
shared/
  types/                   # IPC contracts, event payloads, AppBridge
    app-events.ts          # declare module '@cion-suite/core/ipc' { interface BaseAppEventMap }
  constants/               # cross-process константы (по мере роста)
  utils/                   # pure-функции, не зависящие от Electron API
```

**Augmentation `BaseAppEventMap`** обязательно живёт в `shared/types/` — оба процесса видят через tsconfig include `shared/**`.

## Types placement

| Где используется | Куда положить |
|---|---|
| main + renderer (IPC contract, event payload) | `shared/types/` (`@shared/types`) |
| main-only (service options, store shapes) | `app/types/` |
| renderer cross-slice (context values, generic UI shapes) | `src/shared/types/` |
| feature-local | `src/features/<f>/types/` |
| доменные сущности | `src/entities/<e>/model/` |

**Никогда inline** в компонентах. `import type` (`verbatimModuleSyntax`).

## IPC + events

- **IPC.** Только `ipcMain.handle()` / `ipcRenderer.invoke()` через `contextBridge`. Никакого Node API в renderer. Регистрация — `registerHandlers(map)` из `@cion-suite/core/ipc`.
- **События.** Единый канал `app:event`. Main: `appEvents.emit()` / `emitTo(win, ...)`. Renderer: `useAppEvent(name, handler)`. **Никогда** `win.webContents.send()` руками.
- **Расширение типов событий** — module augmentation `BaseAppEventMap` в `shared/types/app-events.ts`.
- **IPC-валидация.** `id == null || typeof id !== 'number'` — не falsy (`!id` отвергает валидный `0`).

## Core services (composition root)

`app/services/boot.ts` собирает базовые сервисы:

- **Logger** — `@cion-suite/core/log` (`createLogger({ appId })`). Scoped: `logger.child('subsystem')`.
- **SecureStorage** — `@cion-suite/core/storage` (`createSecureStorage`). Plaintext credentials запрещены.
- **SettingsStore** — `@cion-suite/core/settings` (`createSettingsStore` + Zod-схема + migrations).
- **CrashReporter** — `@cion-suite/core/crash`.
- **Window** — `@cion-suite/core/window` (`createWindow`, `requestSingleInstance`). Дефолты: `show: false` + `ready-to-show`.

## Runtime Registry

Cross-feature связывание без compile-time зависимостей.

```ts
// src/shared/lib/registry/<key>.ts
const map = new Map<string, Config>();
export function register<Key>(key: Key, config: Config<Key>): void;
export function get<Key>(key: Key): Config<Key>;
export function assertComplete(expected: Key[]): void;
```

Регистрация распределена:
- `entities/<e>/register.ts` — DataProvider / EntityPickerConfig / Transformer.
- `widgets/<w>/register.ts` — Table / Profile.
- Импорт в `register.ts` — по **прямым подпутям** (`./api`, `./ui/<file>`), не через баррель. Иначе циклы init.

`src/app/App.tsx` (или `src/app/index.tsx`) eager-проверяет полноту:

```ts
import { assertRegistriesComplete } from '@/shared/lib/registry';
assertRegistriesComplete({ db: [...], tables: [...], profiles: [...] });
```

## Context + Provider split

FSD-friendly паттерн для глобального state с `useContext`:

```
src/shared/lib/<domain>/context.ts   ← createContext + useDomain() hook
src/app/providers/DomainProvider.tsx ← Provider, импортирует Context из shared
```

`pages/`/`features/` могут дёргать `useDomain()` без нарушения `pages → app` (запрещено). `app/` владеет state'ом + lifecycle'ом.

## App composition (`src/app/`)

Корень renderer'а:

- `index.tsx` — entry. `createRoot(...).render(<AppProvider><App /></AppProvider>)`. Side-effect баррели `entities` и `widgets` импортируются **до** `createRoot` (порядок: entities → widgets).
- `App.tsx` — `<AppRouter />` + `assertRegistriesComplete`.
- `providers/` — composition: `ErrorBoundary → I18n → Theme → Query → Tooltip → Router → Toast`.
- `routes/` — `<Routes>` без guards.
- `styles/index.css` — Tailwind v4 entry, `@theme inline`.

## Build

- `pnpm dev` — `electron-vite dev`.
- `pnpm build` — `electron-vite build`. Output: `build/out/{main,preload,renderer}`.
- `pnpm dist` — `electron-builder` (stable channel).
- `pnpm dist:beta` — `electron-builder` (beta channel).
- `pnpm typecheck` — `tsc --noEmit` front + back.
- `pnpm lint` — ESLint + FSD boundaries.

**electron-vite output:** main → `index.js`, preload → `index.js`. После build `__dirname` = `build/out/main/`. Для ресурсов — через `app/utils/paths.ts`.

## Naming

- Features / widgets: `kebab-case`, `<domain>-<scenario>` (`user-edit`, `computer-table`).
- Files: `kebab-case.ts` для модулей, `PascalCase.tsx` для компонентов.
- Hooks: `useXxx`.

## ESLint stack

- `@cion-suite/config/eslint` — база (no-console warn, type-imports, no-unused-vars, no-direct-webcontents-send, no-plaintext-credentials).
- `@cion-suite/config/eslint/react` — react-hooks + react-refresh.
- `@cion-suite/config/eslint/fsd` — `boundaries/dependencies` для FSD.
- `src/shared/ui/shadcn/**` — игнорится (внешний код).

## Style + UI

- **Tailwind v4 — CSS-first.** Theme через `@theme inline` в `src/app/styles/index.css`. Нет `tailwind.config.js`.
- **shadcn primitives** в `src/shared/ui/shadcn/`. Управляются через CLI shadcn или skill `/shadcn`. Не редактируются вручную.
- **React 19 + Compiler.** `useMemo`/`useCallback` вручную НЕ нужны.
- **React 19 JSX namespace.** `function App(): JSX.Element` — `TS2503`. Используй inference или `ReactElement`.
