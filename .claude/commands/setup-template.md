---
description: One-shot конверсия Cion-template скелета в конкретный app — replace appId/productName/slug/pkg/URL/splash и срез template-narrative из docs.
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# /setup-template — Template → Project Bootstrap

Зачищает хвосты template-скелета: переименовывает все упоминания на имя конкретного приложения, проставляет `appId` / `productName` / `pkg name` / URL / splash, удаляет template-narrative из README и CLAUDE.md.

**Запускать один раз** — сразу после клонирования template-репо. Идемпотентна: повторный вызов на готовом проекте = no-op (placeholders уже заменены).

Поток: `/setup-template "App Name"` → разработка → по мере drift'а доков `/sync-docs`.

## Input

`$ARGUMENTS` — полное display-имя приложения. **Обязательно.**

Примеры:
```
/setup-template Cion Overtime
/setup-template Cion Admin Tools
/setup-template Acme Tracker
```

Если пусто → отказ + подсказка формата. Не угадывай имя из git remote / package.json.

## Phase 0 — Derive variants

Из `$ARGUMENTS` вывести 5 значений без интерпретации:

| Variant | Правило | Пример (`Cion Overtime`) |
|---|---|---|
| `DisplayName` | as-is | `Cion Overtime` |
| `Slug` | lowercase, слова через `-` | `cion-overtime` |
| `ShortName` | если первое слово == `Cion` → срезать; иначе `DisplayName` | `Overtime` |
| `AppId` | `io.cion.<last_word_lower>` | `io.cion.overtime` |
| `PkgName` | `@cion-suite/<last_word_lower>` | `@cion-suite/overtime` |

`ShortName` идёт только в splash. Везде остальное — `DisplayName`.

Вывести таблицу с derived-значениями пользователю до Phase 3, чтобы подтвердил.

## Phase 1 — Sentinel set

Что искать (template defaults, заменяются → derived):

```
io.cion.template                                → AppId
Cion Template                                   → DisplayName
cion-template                                   → Slug
@cion-suite/template                            → PkgName
https://github.com/cion-suite/cion-template     → https://github.com/cion-suite/<Slug>
```

**ИСКЛЮЧЕНИЕ — `scripts/check-placeholders.mjs`.** Файл хранит эти строки как sentinel-значения для пред-релизной проверки. **Не трогать.** После run'а это будет единственное место в repo, где они лежат — это база safety-check'а.

## Phase 2 — Edit map

Группы файлов и точки правки:

### package metadata
**package.json**
- `name` ← `PkgName`
- `description` ← `{DisplayName} — TODO: краткое описание задачи.` (placeholder для юзера)
- `homepage` ← `https://github.com/cion-suite/{Slug}`
- `repository.url` ← `git+https://github.com/cion-suite/{Slug}.git`
- `bugs.url` ← `https://github.com/cion-suite/{Slug}/issues`

**electron-builder.json**
- `appId` ← `AppId`
- `productName` ← `DisplayName`
- `publish[0].repo` ← `Slug`

### app/runtime config
**app/config.ts**
- `APP_ID = 'io.cion.template'` → `APP_ID = '{AppId}'`
- `PRODUCT_NAME = 'Cion Template'` → `PRODUCT_NAME = '{DisplayName}'`

**src/shared/config/env.ts**
- `appId: 'cion-template'` → `appId: '{AppId}'`
- `productName: 'Cion Template'` → `productName: '{DisplayName}'`

**index.html**
- `<title>...</title>` → `<title>{DisplayName}</title>`

**app/splash.html**
- `<title>...</title>` → `<title>{ShortName}</title>`
- `<img class="logo" id="logo" src="" alt="App">` → `alt="{ShortName}"`
- `<div class="app-name" id="app-name">...</div>` → текст внутри = `{ShortName}`
- Убрать `<!-- REPLACE BEFORE SHIP: ... -->` маркеры (значения уже не placeholder'ы)

### docs (root)
**README.md**
- `# cion-template` → `# {Slug}`
- Описание (вторая строка) → `{DisplayName} — TODO: краткое описание задачи. Electron desktop app на Cion Suite packages.`
- Все вхождения `cion-template/` (в путях / tree) → `{Slug}/`
- Убрать целиком callout «GitHub Template Repository / Use this template» (от `> **GitHub Template Repository.**` до конца блочной цитаты)
- Убрать секцию «Перед первым ship» и связанную таблицу
- Убрать абзац «При публикации форка как самостоятельного приложения переключи `link:` на `workspace:`…»
- Если упомянут `pnpm dist:beta` / `electron-builder.beta.json` / `FEED_URLS.latestUrl|betaUrl` — удалить (beta-канала нет)

**CLAUDE.md**
- `# Cion Template — Agent Guide` → `# {DisplayName} — Agent Guide`
- Tagline: `Стартовый шаблон для apps Cion-экосистемы.` → `{DisplayName} app.` (или TODO-placeholder)
- Убрать секцию «Before first ship» (плейсхолдеры заменены)

**CONTRIBUTING.md**
- Убрать абзац «Это **template-репозиторий**. Если ты создал…» — заменить на: `Правила для PR'ов в \`{Slug}\`.`
- Любые `cion-template` → `{Slug}`

**docs/architecture.md**
- Любые `cion-template` → `{Slug}`
- Если упомянут `pnpm dist:beta` — заменить на `pnpm release`

### docs (.claude)
**.claude/agents/README.md**
- `# Cion Template — Subagents` → `# {DisplayName} — Subagents`
- `Cion Template` в expert-шаблоне → `{DisplayName}`

**.claude/agents/bug-fixer.md, code-reviewer.md, expert-fsd.md, expert-electron.md**
- `Cion Template` → `{DisplayName}` (build-once в каждой первой строке после frontmatter)
- В `expert-electron.md` code-snippet'ах `appId: 'cion-template'` → `appId: '{AppId}'`

**.claude/commands/planner.md**
- `cion-template` → `{Slug}`
- Любые упоминания `electron-builder.beta.json` / beta-channel — удалить

### tooling
**eslint.config.js**
- `cion-template/scripts` → `{Slug}/scripts`
- `cion-template/ignores` → `{Slug}/ignores`

### CI
**.github/workflows/ci.yml + release.yml**
- `path: cion-template` → `path: {Slug}` (все)
- `working-directory: cion-template` → `working-directory: {Slug}` (все)
- `./cion-template/.github/actions/setup` → `./{Slug}/.github/actions/setup`
- `Verify cion-template lockfile…` → `Verify {Slug} lockfile…`

**.github/actions/setup/action.yml**
- `name: Setup template + cion-suite` → `name: Setup {Slug} + cion-suite`
- `description:` строка: `template` → `{Slug}` (везде где не имя файла YAML-схемы)
- `cion-template/pnpm-lock.yaml` → `{Slug}/pnpm-lock.yaml`
- `Install cion-template` → `Install {Slug}`
- `working-directory: cion-template` → `working-directory: {Slug}`
- `to template install` → `to {Slug} install`

### explicit skip
- `scripts/check-placeholders.mjs` — sentinel-источник
- `src/shared/ui/shadcn/**` — внешний код
- `node_modules/**`, `build/**`

## Phase 3 — Apply

Для каждого блока edit map — `Edit` (точечный) или `Edit` с `replace_all: true` где замена тотальна (пути, идентификаторы, slug в YAML).

**Правила:**
- Используй `replace_all: true` для slug / path / appId — это атомарные идентификаторы, ложно-положительные крайне маловероятны.
- Точечные правки заголовков (README L1, CLAUDE.md L1) — Edit с уникальным контекстом.
- Удаление секций («GitHub Template Repository» callout, «Before first ship», template-narrative в CONTRIBUTING) — одним Edit с многострочным `old_string`.
- Не трогать code snippets с пометкой `# example`, `# template` если у них explicit comment, что это иллюстрация.

## Phase 4 — Verify

```bash
pnpm check:placeholders   # 🟢 — иначе остался placeholder
pnpm lint                 # 🟢 — иначе сломал идентификатор
pnpm typecheck            # 🟢 — иначе опечатка в slug/appId
```

Дополнительный grep (должен вернуть пусто кроме `scripts/check-placeholders.mjs`):

```bash
grep -rIE "cion-template|Cion Template|io\.cion\.template|@cion-suite/template" \
  --exclude-dir=node_modules --exclude-dir=build \
  --exclude=check-placeholders.mjs
```

Если падает — посмотри какой placeholder остался, исправь точечно. Не делать silent skip.

## Output

```
Setup done: {DisplayName}
  AppId:    {AppId}
  Slug:     {Slug}
  PkgName:  {PkgName}
  Short:    {ShortName} (splash)

Edited N files:
  - package metadata: package.json, electron-builder.json
  - runtime:          app/config.ts, src/shared/config/env.ts, index.html, app/splash.html
  - docs:             README.md, CLAUDE.md, CONTRIBUTING.md, docs/architecture.md
  - agents:           .claude/agents/*.md
  - commands:         .claude/commands/planner.md
  - tooling:          eslint.config.js
  - CI:               .github/workflows/{ci,release}.yml, .github/actions/setup/action.yml

Skipped: scripts/check-placeholders.mjs (sentinel).

Next:
  - заполни description в package.json (сейчас TODO-placeholder)
  - заполни tagline в README.md / CLAUDE.md
  - замени иконки в public/assets/ (icon.png / icon.ico / icns)
  - первый коммит: /notes → commit
```

## Notes

- `/setup-template` ≠ `/sync-docs`. setup = one-shot конверсия template→app. sync-docs = поддержание актуальности доков по мере разработки.
- Идемпотентна: повторный вызов на готовом проекте ничего не сломает (sentinels отсутствуют, замены no-op).
- Splash намеренно использует `ShortName` (без `Cion`-префикса) — компактность.
- `description` в `package.json` / README / CLAUDE.md остаётся TODO-placeholder — суть app'а знает только владелец проекта. Дозаполни вручную.
- Если `$ARGUMENTS` не начинается с `Cion` — `ShortName` == `DisplayName`. `AppId` всё равно `io.cion.<last_word>` (Cion Suite namespace).
- Если хочешь другой `AppId`-namespace (не `io.cion.*`) — правь руками в `app/config.ts` + `electron-builder.json` после run'а.
