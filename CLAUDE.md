# Cion Template — Agent Guide

Electron + React 19 + Tailwind v4 + shadcn. Стартовый шаблон для apps Cion-экосистемы.

Архитектура: `docs/architecture.md`. Шлифовка/план: `docs/planned_now.md` (если есть).

## Commands

```bash
pnpm dev          # electron-vite dev (main + preload + renderer)
pnpm build        # electron-vite build (build/out/)
pnpm dist         # build + electron-builder (latest)
pnpm dist:beta    # build + electron-builder (beta)
pnpm typecheck    # tsc front + back
pnpm lint         # ESLint + FSD boundaries
```

## Critical Rules

1. **FSD direction:** `app → pages → widgets → features → entities → shared`. Соседи на одном слое не импортируют друг друга, **кроме `widgets/` (композиция layout'а) и `pages/` (sub-pages)** — каноничный FSD это допускает. `features/<X> → features/<Y>` запрещено — cross-feature через runtime-registry (`src/shared/lib/registry/`).

2. **`app` не импортирует `features/**` / `entities/**` напрямую** — только через `pages/<page>/`, `widgets/<w>/`, registry.

3. **Hooks к context — в `src/shared/lib/<domain>/`.** Context+hook в shared, Provider в `src/app/providers/` импортирует context из shared. Иначе `pages/` нарушает `pages → app`.

4. **IPC.** Только `ipcMain.handle()` + `ipcRenderer.invoke()` через `contextBridge`. Никакого Node API в renderer. Регистрация — `registerHandlers(map)` из `@cion-suite/core/ipc`.

5. **События.** Единый канал `app:event`. Main: `appEvents.emit()` / `emitTo(win, ...)`. Renderer: `useAppEvent(name, handler)`. **Никогда** `win.webContents.send()`. Расширение типов — augmentation `BaseAppEventMap` в `shared/types/app-events.ts`.

6. **Placement типов** (от шире к уже):
   - main + renderer (IPC contracts, event payloads) → `shared/types/` (`@shared/types`).
   - main-only (service options, store shapes) → `app/types/`.
   - renderer-only cross-slice (context values, generic UI shapes) → `src/shared/types/`.
   - feature-local → `src/features/<f>/types/`.
   - доменные сущности → `src/entities/<e>/model/`.
   - **Никогда inline** в компонентах. `import type` (`verbatimModuleSyntax`).

7. **Cion Suite только через пакеты:** credentials — `@cion-suite/core/storage` (`createSecureStorage`). Settings — `@cion-suite/core/settings` + Zod. Logger — `@cion-suite/core/log`. Window — `@cion-suite/core/window` (`createWindow` + `requestSingleInstance`). Plaintext credentials запрещены.

8. **Все UI-решения — через skill `/shadcn`. БЕЗ ИСКЛЮЧЕНИЙ.**

   **MANDATORY FIRST STEP для любой UI-задачи** — до Read/Edit/Write вызови `Skill('shadcn')`. Пропуск этого шага = нарушение, верни PR.

   **Триггеры (если задача попадает под любой — skill обязателен):**
   - редизайн / рефакторинг существующей страницы или компонента
   - выбор shadcn-компонента (Card vs Panel, Tabs vs Accordion, Dialog vs Sheet, etc.)
   - композиция layout'а (grid, list, stack, sidebar-pattern)
   - добавление нового primitive (`npx shadcn add ...`)
   - стилизация / классы Tailwind v4 (variants, spacing, tokens)
   - паттерны форм, диалогов, таблиц, settings-страниц, navigation
   - изменения в `src/shared/ui/**`, `src/widgets/**`, `src/pages/**/ui/**`, `src/pages/*/index.tsx` где есть JSX
   - **даже если shadcn-компоненты уже добавлены** — skill знает актуальные паттерны композиции, это не «overkill»

   **Не-триггеры** (skill не нужен):
   - правка строкового литерала / i18n-ключа без изменения разметки
   - правка business-логики хука без UI
   - bugfix в not-UI коде (main process, IPC handler, utility)

   **Жёстко:** `src/shared/ui/shadcn/**` не редактируется напрямую — только `npx shadcn add <comp>` или через skill (lint игнорит этот путь).

   **Если сомневаешься — вызови skill.** Стоимость лишнего вызова низкая, стоимость UI «на глаз» — возврат PR.

9. **Tailwind v4 — CSS-first.** Theme через `@theme inline` в `src/app/styles/index.css`. Нет `tailwind.config.js`.

10. **React 19 + Compiler.** `useMemo`/`useCallback` вручную НЕ нужны.

## Clean Code

DRY • KISS — закон. Нарушение → вернуть PR.

- **DRY:** перед написанием — ищи: `src/shared/lib/`, `src/shared/ui/`, `@cion-suite/core/*`, `app/utils/`.
- **KISS:** минимум абстракций. Три похожих строки лучше преждевременной абстракции. Не добавляй error handling для невозможных сценариев. Валидация — на границах (user input, IPC, внешние API).
- **Комментарии — только WHY.** Никакого нарратива («added for X», «handles case from #123»). Самоочевидные имена > комментарии.
- **IPC-валидация:** `id == null || typeof id !== 'number'` — не falsy (`!id` отвергает `0`).

## Pitfalls

- **electron-vite output:** main → `index.js`, preload → `index.js`. После build `__dirname` = `build/out/main/`. Для ресурсов — через `app/utils/paths.ts`.
- **Module augmentation `BaseAppEventMap`** живёт в `shared/types/app-events.ts` — оба процесса видят через tsconfig include `shared/**/*`.
- **React 19 JSX namespace.** `function App(): JSX.Element` теперь `TS2503`. Inference или `ReactElement`.
- **Boundaries plugin** смотрит `tsconfig.front.json`. Переименовал — обнови `@cion-suite/config/eslint/fsd`.
- **CSP `style-src 'unsafe-inline'`** в `index.html` — осознанный релакс. Tailwind v4 + Vite HMR инжектят inline `<style>` в dev; `onHeadersReceived` не применяется к `file://` (prod `loadFile`), поэтому split prod/dev CSP через headers не работает. Строгая CSP в prod потребует custom protocol (`app://`) — out of scope для template.
- **`npmRebuild: false`** в `electron-builder.json` — корректно для template без native deps. При добавлении `keytar` / `better-sqlite3` / других модулей с N-API: переключить в `true` ИЛИ запустить `npx electron-builder install-app-deps` после `pnpm add`.

## Before first ship

Замени до релиза:

| Где | Что |
|---|---|
| `electron-builder.json` | `appId`, `productName`, `publish[0].url` |
| `electron-builder.beta.json` | `publish[0].url` |
| `app/config.ts` | `APP_ID`, `PRODUCT_NAME`, `FEED_URLS.latestUrl`, `FEED_URLS.betaUrl` |
| `public/assets/` | иконки: `icon.png` (linux) + `icon.ico` (windows) + `icon.icns` (macOS) |
| `package.json` | `name`, `description`, `author` (object с `name`+`email` для подписи), `homepage` |
| `index.html` | `<title>` |

**Инвариант:** URL в `app/config.ts` == `electron-builder.<channel>.json[publish[0].url]`.
Проверяется автоматически: `pnpm check:placeholders` (запускается из `dist` / `dist:beta`). Bypass — `ALLOW_PLACEHOLDERS=1` (только для отладочной сборки, не для релиза).

## STOP & ASK

- Неоднозначные требования — спроси.
- Рефакторинг «попутно» — не трогай. TODO — отметь, не фикси.
- Reuse > новое. Не нашёл — спроси.

## Git

Commit format — `.claude/commands/notes.md`. Pre-flight — `/ship`. Adversarial — `/isgood`. После 🟢 → `/notes` → commit.

## Subagents

`.claude/agents/README.md` — routing. Делегируй спец-агенту (code-reviewer / bug-fixer / expert-electron / expert-fsd). Не делегируй на тривиальных правках (1 файл, ≤20 строк).
