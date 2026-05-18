---
description: Adversarial review diff'а с fix-loop, паттерн-сканером и семантик-агентом
allowed-tools: Bash, Read, Edit, Write, Glob, Grep, Agent
---

# /isgood — Adversarial Review с Fix-Loop

Структурированный adversarial-ревью `git diff HEAD`. **Не пропускай фазы. Не выдавай вердикт без evidence.**

## Phase 0 — Load context

1. Real diff:
   ```bash
   mkdir -p .claude/cache
   git diff HEAD > .claude/cache/isgood-diff.patch
   git status --short
   wc -l .claude/cache/isgood-diff.patch
   ```
   Пустой diff → 🟢 и выход.

2. Загрузи в контекст: `CLAUDE.md` — Critical Rules (§1–§10), Clean Code, Pitfalls.

3. Определи исходную задачу пользователя (последний user-запрос).

4. **Skip-fast.** Если diff ≤ 50 строк И ≤ 2 файла И нет правок в `src/features/`, `src/widgets/`, `src/entities/`, `src/pages/`, `app/handlers/`, `app/services/`, `app/preload.ts`, `app/main.ts` — родитель сам прогоняет правила без агентов.

5. Большой diff (>500 строк) — батчи по файлам.

## Phase 1 — HARD CHECK (2 параллельных агента)

Оба `Agent`-вызова в **одном tool-calls блоке**.

Общие требования:
- diff читать из `.claude/cache/isgood-diff.patch`,
- evidence: `file:line` + цитата,
- фиксы не предлагать (Phase 3),
- ≤ 300 слов,
- нет находок → `CLEAN`,
- формат: `- [🔴|🟡] §<X> <имя> — <file:line> — <цитата>`.

### Agent A — Pattern Scanner

```
subagent_type: code-reviewer
description: Pattern scan (CLAUDE.md Critical Rules + Clean Code + Pitfalls)
prompt: |
  Read .claude/cache/isgood-diff.patch

  Critical Rules (все 🔴):
  §1  FSD direction — соседи на одном слое не импортируют друг друга;
      features/X → features/Y запрещено (cross-feature только через
      runtime-registry src/shared/lib/registry/).
  §2  app не импортирует @/features/** / @/entities/** напрямую —
      только через @/pages/<page>/, @/widgets/<w>/, registry.
  §3  Hooks к context — в src/shared/lib/<domain>/. Context+hook
      в shared, Provider в src/app/providers/ импортирует
      context из shared.
  §4  IPC только ipcMain.handle + ipcRenderer.invoke через contextBridge.
      Никакого Node API в renderer. Регистрация — registerHandlers(map)
      из @cion-suite/core/ipc.
  §5  События — appEvents.emit / emitTo(win, ...) / useAppEvent(name).
      Никогда win.webContents.send. Расширение типов — augmentation
      BaseAppEventMap в shared/types/app-events.ts.
  §6  Placement типов: shared/types (main+renderer) / app/types
      (main-only) / src/shared/types (renderer-only cross-slice) /
      src/features/<f>/types / src/entities/<e>/model.
      Никогда inline в компонентах. import type обязателен.
  §7  Cion Suite только через пакеты — credentials через
      @cion-suite/core/storage (createSecureStorage),
      settings через @cion-suite/core/settings + Zod,
      logger через @cion-suite/core/log,
      window через @cion-suite/core/window (createWindow +
      requestSingleInstance). Plaintext credentials запрещены.
  §8  UI — только через skill /shadcn. src/shared/ui/shadcn/**
      не редактируется руками (только npx shadcn add <comp>).

  Clean Code:
  CC.DRY  🟡 hand-rolled дублирующее существующее (shared/lib,
          shared/ui, @cion-suite/core/*, app/utils).
  CC.KISS 🟡 guard'ы / fallback'и для невозможных сценариев;
          валидация не на границах.
  CC.COM  🟡 комментарии с нарративом («added for X», «fix #123»).
  CC.IPC  🔴 IPC-валидация на falsy вместо `== null || typeof !==`
          (`if (!id)` отвергает 0).
  §10     🟡 ручные useMemo / useCallback (React 19 + Compiler).

  Pitfalls (🟡):
  P.DIR   __dirname в app/ для путей к ресурсам — должно через
          app/utils/paths.ts.
  P.AUG   BaseAppEventMap augmentation не в shared/types/app-events.ts.
  §9      tailwind.config.js или @config — Tailwind v4 CSS-first
          (@theme inline в src/app/styles/index.css).
  P.JSX   `: JSX.Element` в React 19 (TS2503) — inference / ReactElement.

  Output: `- [🔴|🟡] §<X> <имя> — <file:line> — <цитата>`.
  Нет находок → `CLEAN`.
```

### Agent B — Semantic Review

```
subagent_type: code-reviewer
description: Semantic review — scope, KISS, DRY
prompt: |
  Read .claude/cache/isgood-diff.patch

  Исходная задача пользователя:
  <<<
  <вставить запрос>
  >>>

  C1 🔴 Scope-creep — правки вне задачи: переименования «попутно»,
        форматирование, рефакторинг чужого кода.
  C2 🟡 KISS / over-engineering — guard'ы / fallback'и для сценариев,
        которые по типам невозможны.
  C3 🟡 DRY — дублирование. Прежде чем флагать — Grep по
        src/shared/lib, src/shared/ui, @cion-suite/core/*, app/utils.
        Формат: `... existing: <path>`.
  C4 🟡 TODO/tech-debt мимо задачи.

  Output: `- [🔴|🟡] §C<N> <имя> — <file:line> — <цитата>`.
  Нет находок → `CLEAN`.
```

## Phase 2 — Verdict

- 🔴 **BLOCK** — есть хоть один 🔴 → Phase 3.
- 🟡 **ADVISE** — только 🟡. Каждый 🟡 в TODO.
- 🟢 **PASS** — пусто.

## Phase 3 — Fix loop

Пока есть 🔴:
1. На каждый 🔴 — минимальный фикс.
2. Пересобери diff: `git diff HEAD > .claude/cache/isgood-diff.patch`.
3. Перезапусти агента по принадлежности правила (Critical Rules / Clean Code / Pitfalls → A; §C → B; новый файл → оба).
4. До 🔴 = 0. 3 итерации без прогресса → стоп.

## Финальный отчёт

```
Verdict: 🟢|🟡
Fixed (🔴 → ok):
  - §X <правило> — <file:line>
Remaining 🟡 (TODO):
  - §X <правило> — <file:line>
```

🟢 → можно `/notes` + commit.
