# cion-template

Reference Electron desktop application built on Cion Suite packages. Use as the starting point for new Cion apps.

> **GitHub Template Repository.** Нажми **Use this template** → создай свой repo.
>
> **Для CI после форка:** добавь в Settings → Secrets → Actions секрет
> `CION_SUITE_PAT` — fine-grained PAT с правом `Contents: Read` на
> репо `cion-suite/cion-suite`. Без него CI-checkout сиблингового
> приватного monorepo упадёт.

## Requirements

- **Node.js** ≥ 24
- **pnpm** ≥ 11

## Install

> ⚠️ **Шаблон не drop-in.** Зависимости `@cion-suite/*` подключены через
> `link:../cion-suite/packages/*` в `package.json`. Без сиблингового
> checkout'а monorepo `cion-suite/cion-suite` команда `pnpm install`
> упадёт на link-resolution фазе с `ENOENT`. PAT / GitHub Packages
> **не используются** — токен ничего не решает.

**1. Склонируй оба репо рядом** — родительская папка должна содержать
ОБА директория на одном уровне:

```
parent/
├── cion-suite/        # https://github.com/cion-suite/cion-suite (monorepo с пакетами)
└── cion-template/     # этот репо
```

**2. Установи зависимости monorepo** (один раз):

```bash
cd ../cion-suite
pnpm install
pnpm build      # сбилдить @cion-suite/* пакеты
```

**3. Install шаблона + dev:**

```bash
cd ../cion-template
pnpm install
pnpm dev
```

> При публикации форка как самостоятельного приложения переключи
> `link:` на `workspace:` (если форк станет частью monorepo) или
> опубликуй `@cion-suite/*` в private registry и перевесь deps на
> versioned-spec. Это отдельный refactor — out of scope для template.

## Commands

```bash
pnpm dev          # electron-vite dev (main + preload + renderer)
pnpm build        # electron-vite build (build/out/)
pnpm preview      # preview production-сборки
pnpm dist         # build + electron-builder (latest channel)
pnpm dist:beta    # build + electron-builder (beta channel)
pnpm typecheck    # tsc front + back
pnpm lint         # ESLint + FSD boundaries
pnpm ship         # typecheck + lint + build (pre-flight)
pnpm check:placeholders  # ensure appId/feed URLs/pkg metadata replaced (auto-run by dist)
```

Дополнительно — slash-команды Claude Code: `/ship` (pre-flight),
`/isgood` (adversarial review diff'а), `/notes` (changelog), `/shadcn`
(UI-решения). См. `.claude/commands/`.

## Структура

```
app/        # Electron main + preload (composition root, IPC handlers, окна)
src/        # Renderer (React 19, FSD)
  app/      #   providers, routes, styles
  pages/    #   route-level wrappers
  widgets/  #   композиция features+entities
  features/ #   user-сценарии
  entities/ #   доменные сущности
  shared/   #   ui/lib/api/config (renderer-only)
shared/     # Cross-process типы (IPC contracts, event payloads)
build/      # Иконки + output electron-vite/electron-builder
docs/       # architecture.md, planned_now.md
```

Детально — `docs/architecture.md`.

## Перед первым ship

См. секцию **Before first ship** в `CLAUDE.md`. Кратко:

| Где | Что заменить |
|---|---|
| `electron-builder.json` | `appId`, `productName`, `publish[0].url` |
| `electron-builder.beta.json` | `publish[0].url` |
| `app/config.ts` | `APP_ID`, `PRODUCT_NAME`, `FEED_URLS.latestUrl`, `FEED_URLS.betaUrl` |
| `public/assets/` | иконки: `icon.png` (linux) + `icon.ico` (windows) + `icon.icns` (macOS) |
| `package.json` | `name`, `description`, `author`, `homepage` |

**Инвариант:** URL в `app/config.ts` == `electron-builder.<channel>.json[publish[0].url]`.
Проверяется автоматически через `pnpm check:placeholders` (выполняется на `dist` / `dist:beta`). Bypass для отладочной сборки — `ALLOW_PLACEHOLDERS=1`.

> Нативные модули (`keytar`, `better-sqlite3`, …): после `pnpm add` запусти
> `npx electron-builder install-app-deps`, чтобы пересобрать под ABI Electron'а.

## Dependencies updates

Renovate (`renovate.json`) автоматически открывает PR на обновления зависимостей.

## Документация

- `CLAUDE.md` — стиль работы и критические правила для агентов.
- `docs/architecture.md` — устройство скелета + inlined FSD-стандарт.
- `docs/planned_now.md` — текущий план шлифовки (может быть пустым).
