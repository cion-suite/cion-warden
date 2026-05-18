---
description: Sync README.md, CLAUDE.md, .claude/agents/*, .claude/commands/* with current project state (deps, src tree, scripts).
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
---

# /sync-docs — Documentation Sync

Актуализирует документацию проекта под текущее состояние кода. Цель — устранить рассинхрон между тем, что есть в репо, и тем, что обещают `README.md` / `CLAUDE.md` / `.claude/agents/` / `.claude/commands/`.

**НЕ переписывает прозу.** Только убирает упоминания исчезнувшего и добавляет упоминания нового. Стиль и тон сохраняются.

## Input

`$ARGUMENTS` — опционально путь / glob ограничения scope (например, `.claude/agents` или `README.md`). Пусто → весь doc-набор.

## Phase 0 — Snapshot текущего состояния

Собрать факты в одну переменную контекста `PROJECT`. Без интерпретации.

- `Read package.json` → `PROJECT.deps` (runtime + dev) + `PROJECT.scripts` + `PROJECT.version` + `PROJECT.name`.
- `Read src/shared/config/routes.ts` (если есть) → `PROJECT.routes`.
- `Glob` (один блок параллельных вызовов):
  - `src/app/providers/*.tsx` → `PROJECT.providers`
  - `src/pages/*/`, `src/widgets/*/`, `src/features/*/`, `src/entities/*/`, `src/shared/lib/*/` → `PROJECT.fsd`
  - `app/services/*.ts`, `app/handlers/*.ts`, `app/utils/*.ts`, `shared/types/*.ts` → `PROJECT.main`
  - `.claude/agents/*.md`, `.claude/commands/*.md` → `PROJECT.agents` + `PROJECT.commands`

Bash → только если нужный артефакт не файл (например, `git ls-files`).

## Phase 1 — Scan docs

Файлы to-scan (если `$ARGUMENTS` не сузил):

```
README.md
CLAUDE.md
docs/architecture.md
.claude/agents/README.md
.claude/agents/*.md
.claude/commands/*.md
```

Для каждого файла найти **stale references**:

| Категория | Что искать | Сравнить с |
|---|---|---|
| Deps | `@cion-suite/<pkg>`, прочие имена пакетов | `PROJECT.deps` |
| Scripts | <code>pnpm &lt;script&gt;</code> | `PROJECT.scripts` |
| Slices | `src/features/<x>/`, `src/widgets/<x>/`, `src/entities/<x>/`, `src/pages/<x>/`, `src/shared/lib/<x>/` | `PROJECT.fsd` |
| Providers | `<X>Provider`, `useX`, `useOptionalX` | `PROJECT.providers` |
| Routes | `ROUTES.<x>`, `<x>Page` | `PROJECT.routes` |
| Agents | `expert-<x>`, `bug-fixer`, `code-reviewer` | `PROJECT.agents` |
| Commands | <code>/&lt;name&gt;</code>, <code>.claude/commands/&lt;name&gt;.md</code> | `PROJECT.commands` |
| Files | `app/<x>.ts`, `shared/types/<x>.ts` | реальный fs |

**Whitelist** (не ругаться):
- внешние пакеты (`@tanstack/react-query`, `next-themes`, etc — даже если упомянуты, они в `PROJECT.deps`).
- комментарии в коде (только `.md` сканируем).
- блоки кода с явным `# example`, `# template`, `когда добавишь` — это туториалы, не описание текущего состояния.

Для каждой находки: `file:line — <stale-token> — <reason>`.

## Phase 2 — Diff plan

Сгруппировать находки по файлу. Для каждого файла — список правок:

```
.claude/agents/README.md
  L18: убрать строку routing-таблицы для expert-foo (агента нет в .claude/agents/)
  L27: убрать строку decision tree для expert-foo
```

Если правок > 0 → Phase 3. Если 0 — вывести `🟢 Docs in sync` и выйти.

## Phase 3 — Apply

Для каждого файла применить минимальные `Edit` / `Write`:

- **Удаление stale references.** Если упомянутый пакет / агент / провайдер / route отсутствует — удалить строку (или фрагмент абзаца).
- **Добавление новых.** Если в проекте появился новый агент / команда / провайдер / route, не упомянутый в routing-таблицах / списках команд — добавить запись в формате уже существующих.
- **Не переписывать прозу** вне stale-references.
- **Не трогать code snippets** с явной пометкой `# example` / `# template`.
- **Не трогать `docs/planned_now.md`** — это план шлифовки, живёт отдельным циклом.
- **Не трогать `.original.md` / `.bak`** и любые `node_modules/**`.

## Phase 4 — Verify

Прогнать **Phase 1** ещё раз на изменённые файлы — должен вернуться 🟢. Если остался stale — итерация Phase 3. Максимум 3 итерации.

`pnpm typecheck` / `pnpm lint` запускать не нужно — правки только в `.md`. Если случайно затронут код — отдельным шагом `/ship`.

## Output

```
Synced N files:
  - <path> — <X> правок (<краткое: «убрана ссылка на expert-auth», «добавлен раздел про /sync-docs»>)
Skipped:
  - <path> — <причина>
Remaining stale (manual review):
  - <file:line> — <reason>
```

Если 🟢 — `/notes` → commit.

## Notes

- `/sync-docs` ≠ `/isgood`. `/isgood` — adversarial review diff'а. `/sync-docs` — выравнивание документации под код.
- Команду стоит запускать **после** крупных удалений / переименований / добавлений slice'ов или пакетов.
- Если documentation расходится с кодом по существу (например, CLAUDE.md описывает обратное правило архитектуры) — **остановиться и спросить пользователя**, не «фиксить» молча.
