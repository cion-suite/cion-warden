# Contributing

Это **template-репозиторий**. Если ты создал свой проект через **Use this
template** — правь под себя свободно, эти правила к твоему форку
неприменимы. Документ ниже — для PR'ов в сам `cion-template`.

## Setup

См. [README.md → Install](./README.md#install) — нужен PAT с `read:packages`
на org `cion-suite`.

```bash
pnpm install
pnpm dev
```

## Workflow

1. **Branch.** `feature/<short-slug>` или `fix/<short-slug>`. Не пушь в `main`.
2. **Правила архитектуры.** Прочти [`CLAUDE.md`](./CLAUDE.md) — FSD,
   IPC, события, placement типов, Cion Suite packages. Нарушения = возврат PR.
3. **UI-задачи** обязательно через skill `/shadcn` (см. CLAUDE.md §8).
4. **Pre-flight.** Перед коммитом:
   ```bash
   pnpm ship          # typecheck + lint + build
   ```
   Или slash-команда `/ship` в Claude Code.
5. **Adversarial review.** `/isgood` — авто-ревью diff'а.
6. **Commit.** Формат — см. `.claude/commands/notes.md`. Сгенерировать запись
   changelog: `/notes`.
7. **PR.** Описание: что/зачем, как тестировал. Ссылки на issue если есть.

## Code style

- **DRY/KISS** — закон (см. CLAUDE.md «Clean Code»).
- **Комментарии только WHY.** Не описывай ЧТО делает код.
- **`import type`** обязателен (`verbatimModuleSyntax`).
- **Без inline-типов** в компонентах — placement по таблице в CLAUDE.md §6.

## Что не принимаем

- Прямые правки `src/shared/ui/shadcn/**` — только через `npx shadcn add` или skill.
- Plaintext credentials — используй `@cion-suite/core/storage`.
- `win.webContents.send()` — только `appEvents.emit()` / `emitTo()`.
- Cross-feature импорты `features/<X> → features/<Y>` — только через registry.
- Refactoring «попутно» в bugfix-PR. Открой отдельный PR.

## Вопросы

Открой issue с тегом `question` — или спроси в discussions.
