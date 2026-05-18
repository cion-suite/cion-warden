---
description: Adversarial review плана с fix-loop, верификатором и семантик-агентом
allowed-tools: Bash, Read, Edit, Write, Glob, Grep, Agent
---

# /isplan — Adversarial Review плана

Проверяет **план** (документ с находками, действиями), не код. Phase 3 правит план, не production.

## Phase 0 — Load context

1. Цель-файл:
   - аргумент команды → его путь,
   - иначе `docs/planned_now.md`,
   - пуст / отсутствует → 🟢 и выход.

2. Закэшируй:
   ```bash
   mkdir -p .claude/cache
   cp <plan-file> .claude/cache/isplan-plan.md
   grep -oE '[a-zA-Z0-9_./@-]+\.(ts|tsx|js|jsx|md):[0-9]+' .claude/cache/isplan-plan.md \
     | sort -u > .claude/cache/isplan-files.txt
   wc -l .claude/cache/isplan-plan.md .claude/cache/isplan-files.txt
   ```

3. Загрузи `CLAUDE.md` — Critical Rules, Clean Code, Pitfalls.

4. Определи исходную задачу пользователя.

## Phase 1 — HARD CHECK (2 параллельных)

### Agent A — Verify & Pattern Scan

```
subagent_type: code-reviewer
description: Verify findings + scan pattern gaps
prompt: |
  Read .claude/cache/isplan-plan.md
  Read .claude/cache/isplan-files.txt

  Часть 1 — Verify findings.
  Для каждой находки плана:
  1. Открой file:line — есть ли он?
  2. Сравни цитату/описание плана с реальным кодом.
  Классифицируй: ✅ CONFIRMED | ⚠️ PARTIAL | ❌ INVALID.

  Часть 2 — Pattern gaps по Critical Rules (§1–§10) / Clean Code /
  Pitfalls (см. /isgood Agent A) — флагай только то, что план НЕ упоминает.

  Output:
  Часть 1: `[✅|⚠️|❌] <ID> <имя> — <file:line> — <проверка>`
  Часть 2: `[🔴|🟡] §<X> <правило> — <file:line> — <цитата>`

  Резюме: `<N ✅> / <N ⚠️> / <N ❌>` + `<N gaps>`. ≤ 400 слов.
```

### Agent B — Challenge actions + bug hunt

```
subagent_type: code-reviewer
description: Challenge actions + semantic bug hunt
prompt: |
  Read .claude/cache/isplan-plan.md
  Read .claude/cache/isplan-files.txt

  Исходная задача: <<< ... >>>

  Часть 1 — Challenge actions:
  C1 🔴 Корректность — действие решает корень или симптом?
  C2 🔴 Регрессии — git log на «fix», «hack», «workaround»?
        Миграция / breaking change учтены?
  C3 💡 Over-engineering — абстракция на 2-3 использования (KISS).
  C4 ⚠️ Scope-creep (см. CLAUDE.md STOP & ASK).
  C5 ⚠️ Trade-off не проговорён.
  C6 ⚠️ Нет regression-стратегии (hot-path без тестов).

  Часть 2 — Bug hunt по файлам scope'а:
  - 🔴 stale closure / race / missing cleanup
  - 🔴 empty-array / zero-value edge cases на hot-path
  - 🔴 a11y-блокеры (aria/htmlFor/role)
  - 🔴 IPC-валидация на falsy (`if (!id)` отвергает 0)
  - 🟡 silent failures (try/catch глотает ошибку — logger из
       @cion-suite/core/log обязателен)
  - 🟡 hardcode на путях, которые план трогает

  Output: `[🔴|⚠️|💡] <тег> <ID/имя> — <обоснование с file:line>`.
  ≤ 500 слов.
```

## Phase 2 — Verdict

- 🔴 **BLOCK** — ❌ INVALID или 🔴.
- 🟡 **ADVISE** — только ⚠️ / 🟡 / 💡.
- 🟢 **PASS** — пусто.

## Phase 3 — Fix loop (правит **план**, не код)

1. ❌ INVALID → удалить или исправить file:line.
2. 🔴 gap → добавить в план.
3. 🔴/⚠️ рискованное действие → caveat / migration step.
4. Пересобери кэш, перезапусти соответствующего агента.
5. До 🔴/❌ = 0.

## Финальный отчёт

```
Verdict: 🟢|🟡
Accuracy: <N ✅> / <N ⚠️> / <N ❌>
Fixed in plan:
  - <ID> — <правка>
Added findings:
  - <имя> — <file:line>
Remaining 🟡 (TODO):
  - <ID> — <что осталось>
```
