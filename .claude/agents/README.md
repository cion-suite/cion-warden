# Subagents - Routing

Когда делегировать и когда нет - CLAUDE.md §7. Папка - целым путём: всё, что внутри неё, - зона агента.

| Агент | Папки | Не звать |
|-------|-------|----------|
| `expert-electron` | `src/shell`, `src/app/AppProvider.tsx`; `app/main.ts`, `app/preload.ts`, `app/shell`, `app/updater`, `app/utils`, `shared/config.ts`, `shared/settings.ts` | каналы и концерны домена (`expert-warden`), раскладка `src/entities`, `src/kit`, границы слоёв (`expert-renderer`) |
| `expert-warden` | `app/sources`, `app/github`, `app/catalog`, `app/fonts`, `app/libs`, `app/binds`, `app/scripts`; `shared/schema.ts`, `shared/cmd.ts`, `shared/repo.ts`, `shared/types` | окна, старт, settings, updater (`expert-electron`), раскладка `src` (`expert-renderer`) |
| `expert-renderer` | `src/entities`, `src/kit`, `src/ui`, `src/lib`; `src/app` кроме `AppProvider.tsx`; `eslint.config.js` (boundaries), `docs/standard.md` | окна, preload, настройки, updater, содержимое `src/shell` (`expert-electron`), handler'ы и каналы (`expert-warden`) |
| `code-reviewer` | - ревью диффа, staged или PR; семантический проход `/isgood`, `/isplan` | вердикт по строкам скана (`triage`), починка (`bug-fixer`) |
| `triage` | - вердикт по строкам отчёта из `.claude/cache/` (haiku), без фиксов | семантическое ревью (`code-reviewer`) |
| `bug-fixer` | - баг с неясной причиной, root-cause и минимальный фикс | рефакторинг и новая функциональность - агент зоны |

Домен warden (источники GitHub, каталог, libs, binds, шрифты, скрипты) закрыт `expert-warden`. Новый домен приложения (своя сущность, интеграция) - отдельный `expert-<домен>` по образцу `expert-warden`; строка в таблицу - в том же коммите.
