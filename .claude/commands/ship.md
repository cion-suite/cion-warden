---
description: Pre-flight checklist — typecheck, lint, FSD boundaries audit, build
allowed-tools: Bash, Read, Glob, Grep
---

# /ship — Pre-flight Checks

Запускает все проверки перед merge / commit / publish. Останавливается на первой ошибке.

## Checklist

1. **Typecheck.** `pnpm typecheck` (front + back). Errors блокируют.
2. **Lint.** `pnpm lint`. 0 errors. Warnings — baseline.
3. **FSD boundaries audit** (дублирует ESLint, быстрый grep-санитизатор; `CLAUDE.md §1, §2`):
   ```bash
   # features/X ↔ features/Y запрещён (§1)
   for f in src/features/*/; do
     feat=$(basename "$f")
     grep -rn "from '@/features/" "$f" 2>/dev/null | grep -v "@/features/$feat" \
       && { echo "Cross-feature violation in $feat"; exit 1; } || true
   done

   # app не импортирует features/entities напрямую (§2)
   grep -rn "from '@/features/\|from '@/entities/" src/app 2>/dev/null \
     && { echo "app→features/entities direct import"; exit 1; } || true

   # webContents.send мимо appEvents (§5)
   grep -rn "webContents\.send" app/ 2>/dev/null \
     && { echo "Direct webContents.send — use appEvents.emit (§5)"; exit 1; } || true
   ```
4. **Build.** `pnpm build`. Verify clean completion.
5. **Diff review.** `git diff main...HEAD` (или текущая ветка vs main). Глянь на:
   - Cross-feature imports (§1).
   - `app → features/entities` напрямую (§2).
   - Plaintext credentials мимо `@cion-suite/core/storage` (§7).
   - Прямой `win.webContents.send` (§5).
   - Inline types в компонентах (§6).
   - `any` types.
   - Оставленные `console.log` (логгер — `@cion-suite/core/log`, §7).
   - Ручные `useMemo` / `useCallback` (§10 — React 19 + Compiler).
   - Правки в `src/shared/ui/shadcn/**` руками (§8 — только через `npx shadcn add` или skill `/shadcn`).

## Summary

Report per-check: PASS / FAIL.

Overall:
- **READY TO MERGE** — все 5 проверок PASS.
- **ISSUES FOUND** — есть FAIL. Список конкретных проблем.

## Notes

- `/ship` ≠ `/isgood`. `/isgood` — adversarial code review (Critical Rules + Clean Code + scope). `/ship` — механические gates (typecheck / lint / build).
- Перед merge запускай оба: сначала `/isgood`, после фиксов — `/ship`.
