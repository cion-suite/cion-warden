---
description: Plan and break down a multi-step feature into structured phased tasks
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
---

# /planner — Phased Implementation Plan

Разбить feature / refactoring / multi-step task на последовательные фазы с явными quality gates и DRY-контрактом. План интегрируется с `/isgood`, `/notes`, `/ship` и конвенцией `docs/planned_now.md` (см. `CLAUDE.md`).

## Input

Пользователь описывает задачу. Аргумент: `$ARGUMENTS`.

---

## Phase 0 — Clarify (входной гейт)

Перед составлением плана оцени запрос на неоднозначность. Если есть **≥ 2** неясных момента из списка ниже — **остановись и задай вопросы**, не угадывай (`CLAUDE.md STOP & ASK`: «Неоднозначные требования — спроси»).

Типичные неясности:
- Выбор технологии / библиотеки (есть ли уже используемая в `@cion-suite/core/*` или `src/shared/`?).
- Граница scope (что в задаче, что вне).
- Формат данных / IPC-контракт (поля, типы, nullable).
- Новая сущность или расширение существующей.
- Целевой слой FSD: `app` / `pages` / `widgets` / `features` / `entities` / `shared`.
- Целевой процесс: main (`app/`) / renderer (`src/`) / shared (`shared/`).
- UX-решение при конфликте вариантов — спросить и сослаться на skill `/shadcn`.

Если ≤ 1 неясность и она не блокирующая — продолжай, зафиксировав допущение в Phase 1.

---

## Phase 1 — Understand

1. Прочитать `CLAUDE.md` — Critical Rules (§1–§10), Clean Code, Pitfalls.
2. Прочитать `docs/architecture.md` (карта проекта).
3. Сформулировать коротко (1–3 предложения каждое):
   - Ожидаемый результат.
   - Затронутые слои FSD: `app` → `pages` → `widgets` → `features` → `entities` → `shared`.
   - Затронутые процессы: renderer (`src/`) / main (`app/`) / shared (`shared/`).
   - Внешние пакеты Cion Suite в игре: `@cion-suite/core` (storage/settings/log/window/ipc).
   - Зафиксированные допущения (если Phase 0 пропустила неясность).

---

## Phase 2 — Explore (с бюджетом)

Цель — собрать **существующие** утилиты/hooks/паттерны для переиспользования (DRY) и список файлов, которые будут модифицированы.

**Выбор инструмента:**

- **Средний / большой scope** (затронуто ≥ 3 файла или ≥ 2 слоя FSD) → делегировать в параллельный агент:
  ```
  subagent_type: Explore (thoroughness: "medium")
  prompt: |
    Для задачи "<$ARGUMENTS>" найди в репозитории cion-template:
    1. Существующие hooks / утилиты / компоненты для переиспользования.
       Искать в: src/shared/lib/, src/shared/lib/registry/, src/shared/ui/,
       app/utils/, app/services/, app/handlers/,
       shared/types/, @cion-suite/core/* (storage, settings, log,
       window, ipc).
    2. Аналогичные уже реализованные паттерны (feature slice, IPC handler,
       app-event payload, provider+context split).
    3. Файлы, которые будут модифицированы при реализации.
    Верни: списки путей с краткими комментариями. ≤ 400 слов.
  ```
  Изолированный контекст агента не засорит родительский.

- **UI / shadcn** — обязательно через skill `/shadcn` (CLAUDE.md §8). Не угадывай компоненты руками.

- **Малый scope** (1 файл, очевидное изменение) → inline: ≤ 3 `Grep` + `Read` ключевых файлов.

**Запрет:** не читать файлы «на всякий случай». Каждое чтение должно отвечать на конкретный вопрос плана.

---

## Phase 3 — Plan

Разбить на последовательные фазы. Для **каждой фазы** указать:

- **What** — краткое описание deliverable (1–2 предложения).
- **Where** — точные пути файлов (create / modify). Aliases: `@/*` → `src/*`, `@shared/*` → `shared/*`.
- **How** — подход; если применим уже реализованный паттерн — сослаться на него (путь к файлу-образцу).
- **Reuse** — список существующих hook / util / component / package из Phase 2, используемых в фазе. Если «новый» — **обосновать**: искал там-то, не нашёл, создаю под конкретную потребность. Пустое поле запрещено.
- **Depends on** — какие фазы должны быть завершены раньше.

---

## Phase 4 — Assess (checklist, не проза)

Пройти по чек-листу. Каждый пункт отметить `[x]` / `[ ]` + короткое обоснование:

```
[ ] FSD direction      — §1: соседи не импортируют друг друга;
                         features/X → features/Y только через
                         src/shared/lib/registry/
[ ] app → pages/widgets — §2: app не импортирует @/features/** /
                         @/entities/** напрямую
[ ] Context+hook split — §3: hooks к context в src/shared/lib/<domain>/,
                         Provider в src/app/providers/
[ ] IPC-пары           — §4: каждый новый канал зарегистрирован в
                         preload (contextBridge) и через
                         registerHandlers(map) из @cion-suite/core/ipc
[ ] События            — §5: новые события — augmentation
                         BaseAppEventMap в shared/types/app-events.ts,
                         appEvents.emit / useAppEvent, никогда
                         win.webContents.send
[ ] Types placement    — §6: правильный слой (shared/types / app/types /
                         src/shared/types / src/features/<f>/types /
                         src/entities/<e>/model); никогда inline;
                         import type
[ ] Cion Suite пакеты  — §7: credentials — @cion-suite/core/storage;
                         settings — @cion-suite/core/settings + Zod;
                         logger — @cion-suite/core/log;
                         window — @cion-suite/core/window
[ ] UI через /shadcn   — §8: все UI-решения через skill;
                         src/shared/ui/shadcn/** не трогать руками
[ ] Tailwind v4        — §9: theme через @theme inline в
                         src/app/styles/index.css; нет tailwind.config.js
[ ] React 19 Compiler  — §10: нет ручных useMemo / useCallback
[ ] Reuse-контракт     — поле Reuse заполнено для каждой фазы; DRY
[ ] KISS               — нет фаз «на будущее»; каждая несёт value
[ ] Scope              — ≤ 5 фаз. Больше — split на независимые
                         shipable epic'и
[ ] Before-ship invariants — затронуты electron-builder.json /
                         electron-builder.beta.json / app/main.ts
                         setupAutoUpdater? URL инвариант сохранён?
```

Если `[ ]` осталось хоть одно — вернуться в Phase 3 и доработать план. Не выдавать Output с невыполненными пунктами.

---

## Phase 5 — Output

Сгенерировать markdown-план с единым блоком completion-steps и phases-блоком.

```
## Completion steps (после каждой фазы)

1. `pnpm typecheck` (front + back).
2. `pnpm lint` (ESLint + FSD boundaries).
3. `/isgood` — adversarial review + fix-loop.
4. `/notes` — changelog entry (UNCOMMITTED mode — без args).
5. Отметить фазу как `[done]` в `docs/planned_now.md`.
6. **STOP & WAIT** — явного confirmation от пользователя перед следующей фазой.

## Feature: <name>

### Phase 1: <title>
- **What:** ...
- **Where:** `path/to/file.ts` (create | modify)
- **How:** ... (при необходимости ссылка на образец: `src/features/<f>/...`)
- **Reuse:** `useX` из `src/shared/lib/...`, `createSecureStorage` из `@cion-suite/core/storage`
- **Depends on:** —

### Phase 2: <title>
- **What:** ...
- **Where:** ...
- **How:** ...
- **Reuse:** ...
- **Depends on:** Phase 1

...

## Before merge

Запустить `/ship` — pre-flight checklist (typecheck + lint + FSD audit + build).
```

---

## Phase 6 — Persist (опционально, по согласию пользователя)

После того как пользователь одобрил план:

1. Спросить: «Записать план в `docs/planned_now.md`?»
2. Если **да** — записать через `Write` (один активный план за раз — перезапись допустима).
3. Если **нет** — план остаётся только в чате. Не записывать без явного согласия.

Перезапись `docs/planned_now.md` всегда требует явного подтверждения, даже если предыдущий план уже завершён.

---

## Waiting for approval

После Phase 5 вывести план и **остановиться**. Не переходить к реализации, пока пользователь не сказал «делай» (или эквивалент). Это жёсткий гейт — `CLAUDE.md STOP & ASK`.
