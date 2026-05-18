# Cion Template — Subagents

Routing-таблица для делегирования задач специализированным агентам.

## Когда делегировать

Делегируй, если задача попадает в область конкретного агента **и** требует ≥ 3 файлов / cross-cutting знания / специфичной экспертизы.

**Не делегируй** на тривиальных правках: 1 файл, ≤ 20 строк, без cross-core эффекта.

## Routing table

| Задача | Агент | Триггеры |
|--------|-------|----------|
| Ревью diff / staged / файла | `code-reviewer` | «посмотри diff», «ревью», `/isgood` Phase 1 |
| Bug — диагностика + минимальный фикс | `bug-fixer` | «не работает», «падает», «странное поведение» |
| Main process / IPC / window / preload / appEvents | `expert-electron` | новый IPC-канал, окно, событие, updater, settings/storage/log/crash через `@cion-suite/core` |
| FSD-границы / placement / cross-feature / registry / boundaries error | `expert-fsd` | «куда положить», «boundaries ругается», «нужно вынести в shared», «registry pattern» |

## Decision tree

```
Это ревью кода?               → code-reviewer
Это диагностика бага?         → bug-fixer
Main process / IPC / window?  → expert-electron
Куда положить / FSD-error?    → expert-fsd
Прочее                        → решай сам или спроси
```

## Parallel invocation

`/isgood` Phase 1 вызывает `code-reviewer` дважды в параллель (Pattern + Semantic). Для других кейсов — параллель имеет смысл, когда задачи независимы:
- expert-electron (новый IPC) + expert-fsd (placement consumer'а IPC в renderer).

Параллельный вызов — в **одном tool-calls блоке** (иначе пойдут последовательно).

## Что агенты НЕ делают

- `code-reviewer` — read-only. Не правит код. Не предлагает фиксы (кроме path к существующей альтернативе для DRY).
- `bug-fixer` — не рефакторит окружающий код. Минимальный фикс + completeness check. Останавливается на ≥ 4 файла одной ошибки.
- `expert-*` — не лезут вне своей области. Если задача требует FSD-решения — domain-агент делает свою часть и предлагает делегировать остальное.

## Adding new agents

При расширении app — новые domain-experts (например, `expert-users`, `expert-billing` под доменную область). Шаблон:

```md
---
name: expert-<domain>
description: <Одно предложение про область>
tools: Bash, Read, Write, Edit, Glob, Grep
---

Ты <domain>-эксперт проекта Cion Template.

## Роль
## Обязательный контекст
## Карта ключевых файлов
## Правила / Паттерны
## Pitfalls
## Output
```

Обнови эту routing-таблицу при добавлении.
