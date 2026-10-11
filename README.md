# cion-warden

Warden of your macros - download, run, update.

Cion Warden - десктопное приложение (Electron) для менеджмента AutoHotkey-скриптов: подключаешь GitHub-репозитории как источники, скачиваешь скрипты, библиотеки и пресеты биндов, настраиваешь хоткеи и значения, запускаешь и обновляешь. Шрифты источников ставятся в профиль пользователя (Windows).

- **Scripts** - локальные скрипты: запуск и остановка, конфиг (хоткеи и значения), проверка недостающих библиотек.
- **Get Scripts** - скрипты из всех источников: скачать, обновить.
- **Libraries** - библиотеки из всех источников.
- **Binds** - пресеты биндов с формой значений.
- **Settings** - тема, язык, лимит GitHub API, обновления.

Приватные репозитории - через Personal Access Token; токен хранится только в `vault` ядра (шифрование ОС).

## Requirements

- **Node.js** >= 24
- **pnpm** >= 11

## Install

> Зависимость `@cion-suite/core` подключена через
> `link:../cion-suite/packages/core` в `package.json`. Без соседнего
> checkout'а репозитория `cion-suite` команда `pnpm install` упадёт
> на link-resolution фазе с `ENOENT`. PAT / GitHub Packages не используются.

**1. Склонируй оба репозитория рядом** - родительская папка содержит оба каталога на одном уровне:

```text
parent/
  cion-suite/    # https://github.com/cion-suite/cion-suite (monorepo с пакетами)
  cion-warden/   # этот репозиторий
```

**2. Собери ядро** (один раз и после каждого `git pull` в `cion-suite`):

```bash
cd ../cion-suite
pnpm install
pnpm build      # dist @cion-suite/core: без него typecheck, lint и dev не стартуют
```

**3. Install + dev:**

```bash
cd ../cion-warden
pnpm install
pnpm dev
```

## Commands

```bash
pnpm dev                 # electron-vite dev (main + preload + renderer)
pnpm build               # electron-vite build (build/out/)
pnpm preview             # preview production-сборки
pnpm dist                # check:placeholders + build + electron-builder (latest)
pnpm dist:beta           # то же, beta-канал
pnpm typecheck           # front + back + node (typecheck:front / typecheck:back - по отдельности)
pnpm lint                # ESLint: правила ядра, boundaries, rules.mjs
pnpm test                # vitest run (tests/ - зеркало app/ shared/ src/)
pnpm ship                # typecheck + lint + test + build (pre-flight)
pnpm check:placeholders  # appId / URL фидов / метаданные заменены (запускается в dist)
```

Дополнительно - slash-команды Claude Code (`.claude/commands/`):
`/planner` (план фичи), `/isplan` (adversarial review плана),
`/ship` (pre-flight), `/isgood` (adversarial review diff'а),
`/notes` (changelog и commit-сообщение), `/sync-docs` (сверка документации),
`/shadcn` (UI-решения).

## Структура

```text
app/        # Electron main: app/<концерн>/module.ts (kernel.module)
  shell/ sources/ github/ catalog/ fonts/ libs/ binds/ scripts/ updater/ utils/
src/        # Renderer (React 19)
  app/      #   провайдеры, роутер, стили
  shell/    #   оболочка окна (навигация, настройки, обновления)
  entities/ #   source, script, library, bind: части-сценарии и экраны
  kit/      #   catalog-actions (действия над каталогом без знания сущностей)
  ui/       #   примитивы и shadcn
  lib/      #   утилиты, хуки, state, i18n
shared/     # Контракты main <-> renderer (каналы, события, схемы, типы)
tests/      # vitest, зеркало app/ shared/ src/
docs/       # standard.md, architecture.md, app.md, versions/
public/     # иконки (public/assets)
```

Детально - `docs/architecture.md`.

> Нативные модули (`keytar`, `better-sqlite3`, ...): после `pnpm add` запусти
> `npx electron-builder install-app-deps`, чтобы пересобрать под ABI Electron'а.

## Dependencies updates

Renovate (`renovate.json`) автоматически открывает PR на обновления зависимостей.

## Документация

- `CLAUDE.md` - правила проекта и критичные инварианты (для людей и агентов).
- `docs/standard.md` - эталон раскладки `src/` (неприкосновенный).
- `docs/architecture.md` - текущая архитектура: концерны main, сущности renderer, исключения из эталона.
- `docs/app.md` - продукт: разделы, потоки, каналы и события.
- `CONTRIBUTING.md` - как вносить изменения.
