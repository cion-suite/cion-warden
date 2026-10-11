# Contributing

Правила для PR'ов в `cion-warden`.

## Setup

См. [README.md](./README.md#install) - нужен соседний checkout `cion-suite` с собранным ядром (`pnpm build` в нём).

```bash
pnpm install
pnpm dev
```

## Workflow

1. **Branch.** `feature/<short-slug>` или `fix/<short-slug>`. Не пушь в `main`.
2. **Правила архитектуры.** Прочти [`CLAUDE.md`](./CLAUDE.md) - раскладка `src/` (`app -> shell | entities -> kit -> ui -> lib`), IPC, события, хранение, размещение типов. Устройство - [`docs/architecture.md`](./docs/architecture.md), эталон раскладки - [`docs/standard.md`](./docs/standard.md). Нарушения = возврат PR.
3. **UI-задачи** обязательно через skill `/shadcn` (см. CLAUDE.md).
4. **Тесты.** Новая логика - тест в `tests/<путь>/<модуль>.test.ts`, зеркально исходнику (vitest). Тест вне `tests/` или без пары валит `pnpm lint`.
5. **Pre-flight.** Перед коммитом:
   ```bash
   pnpm ship          # typecheck + lint + test + build
   ```
   Или slash-команда `/ship` в Claude Code.
6. **Adversarial review.** `/isgood` - авто-ревью diff'а.
7. **Commit.** Формат - см. `.claude/commands/notes.md`. Сгенерировать запись changelog и commit-сообщение: `/notes`. Лог версий (`docs/versions/*.md`) руками не правим.
8. **PR.** Описание: что и зачем, как тестировал. Ссылки на issue, если есть.

## Code style

- **DRY/KISS** - закон (см. CLAUDE.md, раздел 1).
- **Комментарии только WHY.** Не описывай, ЧТО делает код.
- **Только клавиатурные символы** в комментариях, документации и commit-сообщениях (без стрелок, длинного тире, box-drawing).
- **`import type`** обязателен (`verbatimModuleSyntax`).
- **Без inline-типов** в компонентах - размещение типов в CLAUDE.md, раздел 3.
- **Handler в `app/` бросает** (`errors.fail`), аргументы описаны zod-схемой, не возвращает `{ ok: false }`.

## Что не принимаем

- Прямые правки `src/ui/shadcn/**` - только через `npx shadcn add` или skill.
- Plaintext credentials - используй `vault` из `@cion-suite/core`.
- `win.webContents.send()` - только `events.emit()`.
- Собственные `electron-store`, `localStorage`-обёртки, голый `fetch` и `net` - есть `settings`, `state`, `vault`, `http` ядра.
- Нарушения направления импортов (`docs/standard.md`) - ловит `pnpm lint`.
- Смена `CONFIG.appId` и пути в `paths.userData` - осиротит токены источников и все локальные данные (см. CLAUDE.md, раздел 4).
- Refactoring "попутно" в bugfix-PR. Открой отдельный PR.

## Вопросы

Открой issue с тегом `question` - или спроси в discussions.
