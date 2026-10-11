---
description: Сверка документации с репозиторием - детерминированный скан, haiku-триаж, opus-вердикт
argument-hint: "[path-prefix]"
allowed-tools: Bash, Read, Edit, Agent
---

# /sync-docs - сверка документации с репозиторием

Правит **ссылки**, не прозу: убрать несуществующее, добавить существующее в уже имеющиеся списки и таблицы. Существование проверил скрипт; модель решает одно - ссылка устарела или намеренна.

Скан-доки: `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `docs/*.md`, `.claude/agents/*.md`, `.claude/commands/*.md`.

---

## Phase 0 - Скан (bash, 0 агентов)

```bash
node .claude/scripts/doc-refs.mjs $ARGUMENTS
```

Строки расхождений несут всё для решения (при `MISSING <= 15` - прямо в stdout, иначе - в `.claude/cache/sync-docs/report.md`):
- MISSING: `<file>:<line> [<kind>] <token> - <текст строки>`; у `[file]` хвост `=> похоже: <путь>` (однозначный кандидат на замену) или `=> замены нет`. `[line]` - любая `путь:N` вне fence: номер строки уезжает молча; `[depth]` - путь в профиле агента глубже части; `[frontmatter]` - frontmatter агента нарушает контракт (вместо текста строки - диагноз, например `description 484 > 300`).
- UNDOCUMENTED: `[<kind>] <имя>  => соседи перечислены в <file>:<строки>` или `=> списка соседей нет - TODO`.

По stdout `MISSING=N (root=a agents=b commands=c) SUPPRESSED=S UNDOCUMENTED=M`:
- `MISSING=0 UNDOCUMENTED=0` -> `Docs in sync`, стоп. Агентов нет, кеша нет - скрипт его не создал.
- `MISSING <= 15` -> родитель триажит сам по строкам stdout и критериям Phase 1, без Read, сразу Phase 2.
- иначе -> Phase 1.

---

## Phase 1 - Триаж (haiku, параллельно)

**КРИТИЧНО:** все `Agent`-вызовы в **одном** tool-calls блоке. Только группы с ненулевым счётчиком из Phase 0.

| Агент | группа | `<PREFIX>` |
|---|---|---|
| triage-root | `root` | `^(README\|CLAUDE\|CONTRIBUTING\|docs/)` |
| triage-agents | `agents` | `^\.claude/agents/` |
| triage-commands | `commands` | `^\.claude/commands/` |

```
subagent_type: triage
description: Triage doc refs (<группа>)
prompt: |
  Bash: grep -E '<PREFIX>' .claude/cache/sync-docs/report.md

  Каждая строка - ссылка дока на то, чего в репозитории нет, или нарушение контракта профиля агента; текст строки (или диагноз) уже в ней.
  Открывай файл, только если этого текста не хватает для решения.

  STALE - ссылка устарела, надо править (`=> похоже:` - вероятная замена). `[line]`, `[depth]` и `[frontmatter]` - всегда STALE: это нарушение контракта профиля, а не пример.
  OK - ссылка намеренна:
    - явный шаблон/пример вне fence (`path/to/file.ts`, `expert-foo`),
    - путь во внешнем репозитории, ещё не внесённый в `EXTERNAL` в `doc-refs.mjs`,
    - `[command?]`, которого нет ни в `.claude/commands/`, ни в `.claude/skills/`, ни среди встроенных скиллов.

  Вывод строго по строке на находку: `<file>:<line> <STALE|OK> - <причина <= 10 слов>`
  Ничего не предлагай чинить. Ничего сверх этих строк.
```

Дождись всех. Агрегируй только `STALE`.

---

## Phase 2 - Вердикт (родитель, opus)

1. **STALE** -> в план правок: удалить ссылку или заменить на актуальную. `=> похоже:` - кандидат, сверь по смыслу строки. `[line]` - заменить `путь:N` символом или путём без номера; `[depth]` - заменить путь символом или папкой части; `[frontmatter]` - исправить поле (правка `description` - разрешённая правка прозы).
2. **UNDOCUMENTED** - агент, команда, сущность `src/entities/<e>` или модуль `src/kit/<m>`, которого целым путём не называет ни один скан-док (части сущностей, экраны, `shell`, `ui`, `lib` скрипт не требует) -> добавить **только** в блок из `=> соседи перечислены в ...`. `списка соседей нет` -> TODO, секцию не создавать.
3. **STOP & ASK:** если док описывает не устаревшее имя, а другую архитектуру/политику - не решать молча, спросить пользователя.

Пусто после триажа -> `Docs in sync`, к Phase 4 (cleanup).

---

## Phase 3 - Правки

Только markdown, минимальным диффом.

Не трогать: прозу вне сломанной ссылки (кроме поля frontmatter при `[frontmatter]`), `docs/planned-now.md`, `.claude/skills/**` (вендорные), `.bak`, `node_modules`, build. `SUPPRESSED` не править: скрипт отсеял лишнее - чинится `doc-refs.mjs`, а не док.

---

## Phase 4 - Verify + cleanup

```bash
node .claude/scripts/doc-refs.mjs $ARGUMENTS
rm -rf .claude/cache/sync-docs
```

`MISSING` больше числа находок, оставленных намеренно (OK, TODO, STOP & ASK), -> повтори Phase 3. Три итерации без прогресса -> стоп, доложи что застряло.

`rm -rf` - в любом исходе, включая прерывание после Phase 1.

---

## Отчёт

```
Synced <N> файлов:
  - <path> - <X> правок (<причина>)
Added:
  - <path> - <что добавлено из UNDOCUMENTED>
TODO (нет подходящего списка / policy shift):
  - <file:line> - <причина>
```

Чисто -> `/notes` + commit.
