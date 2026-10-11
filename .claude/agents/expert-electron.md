---
name: expert-electron
description: Main-процесс и оболочка окна - старт, окна, preload, settings, updater, утилиты main, shell и провайдеры. Звать - окно, настройка, старт и порядок модулей, updater, пути. Не звать - каналы и события домена warden (expert-warden), раскладку entities и kit (expert-renderer).
tools: Bash, Read, Write, Edit, Glob, Grep
---

Ты эксперт main-процесса и оболочки окна Cion Warden (Electron + React 19, ядро `@cion-suite/core` 2.0).

## Зона и граница

- Main: `app/main.ts` (старт, `settings.configure` и `ipc.configure`, `kernel.run`), `app/preload.ts`, `app/utils` (`paths` - единственный дом путей, `environment`), `app/shell` (`index` - namespace `shell`, окна и splash; `module.ts`), `app/updater` (`module.ts`, `updater.ts`). Правило раскладки: концерн = папка, `<концерн>/module.ts` - его `kernel.module`; файл карты = карта каналов и её zod-схемы.
- Shared: `shared/config.ts` (`CONFIG` - единственный редактируемый конфиг), `shared/settings.ts` (схема настроек), строки `updater:*` в `shared/types` (`ipc-channels.ts`, `app-events.ts`, `updater.ts`). `shell` - нижний слой: `app/shell/**` не импортирует соседние концерны `app/`.
- Renderer: `src/shell` (layout, navbar, sidebar, настройки, главная, обновление - экраны `<X>Page.tsx` в `src/shell/<x>/`) и `src/app/AppProvider.tsx`.
- Не твоё: концерны домена `app/{sources,github,catalog,fonts,libs,binds,scripts}`, `shared/{schema,cmd,repo}.ts`, доменные типы и каналы - `expert-warden`; раскладка `src/entities`, `src/kit`, `src/ui`, `src/lib`, правила импортов и eslint boundaries - `expert-renderer`; `src/app/AppRouter.tsx` и `src/app/App.tsx` - без делегирования.

## Навигация

- Файлы - `git ls-files src/shell src/app app shared`.
- Где объявлен - `node .claude/scripts/map.mjs shell paths env`.
- Канал целиком - `git grep -n "'<канал>'" -- shared app src`: тип в `IpcChannelMap` (`shared/types/ipc-channels.ts`), handler. Метод `window.<ns>.<m>` - имя канала `'<ns>:<m>'`, отдельной строки фасада нет.
- Кто импортирует - `node .claude/scripts/graph.mjs deps <путь>`.

## Инварианты сверх CLAUDE.md

- Карты handler'ов привязывает `kernel`: модули `shell` (без каналов; `start` ставит тему - `shell.theme.set` -> `nativeTheme.themeSource`, дальше за `settings.on('theme')` - и открывает splash), `updater` - в `<концерн>/module.ts`. Статус модулей отдаёт ядро: `kernel.status()` из `@cion-suite/core/renderer` (служебный канал, вне гейтов модулей); `health` модуля помечает `running` модуль полем `problem`. Настройки: `settings.configure({ schema })` в `main.ts` до `kernel.run`; renderer читает снимок и пишет через ядро (`settings.get` / `set` / `patch` / `useSetting`), своих каналов и порядка старта у приложения нет.
- Журнал IPC - `ipc.configure` (`thresholdMs`, `silent`, `always`; паттерн - канал или `'prefix:*'`) прямо в `main.ts` до `kernel.run`; порядок с привязкой каналов не важен: канал читает настройки на каждом вызове.
- Значение main -> каждый renderer (read-only) - запись `IpcValueMap` (`shared/types/ipc-channels.ts`), main отдаёт его в `kernel.run({ values })`, в renderer оно читается синхронно как `window.<путь>`. Свой `ipcMain.on` и `sendSync` не заводи: блокируют рендер.
- Старт `main.ts` - первыми строками `app.setName(CONFIG.appId)` и `app.setPath('userData', paths.userData())`, до `settings.configure` и `kernel.run`: сторы `vault` и `settings` называются по `app.getName()`, и без закрепления токены и данные прежнего warden не найдутся. Порядок модулей в `modules` - `shell, sources, github, catalog, fonts, libs, binds, scripts, updater` (`needs` - только предки выше).
- Запуск - `kernel.run({ modules, values, onSecondInstance, ready })` в `main.ts` (`shellModule` первым): ядро ведёт lock -> `whenReady` -> `boot` -> `ready()`, `before-quit`, `window-all-closed` и `uncaughtException` / `unhandledRejection`; своих обработчиков этого в приложении нет. Сбой `boot` / `ready` ядро показывает окном "Ошибка запуска" и выходит с кодом 1. Модули экспортируются как `<имя>Module` (`shellModule`, `updaterModule`) и импортируются через `@app/<папка>/module`. Каналы модуля - карта `handlers` (`satisfies IpcHandlers`), привязывает ядро: `running` -> внутренний register ядра, отключённый или упавший (и зависящий от него) -> заглушка ядра с причиной; зависимость - `needs`, отключение - `enabled`.
- Окна создаёт только `shell` (`app/shell/`) поверх `windows.create`; `app/main.ts` и handler'ы зовут `shell.*`, а не `electron.shell`. Страж навигации - в фабрике ядра, глобального `web-contents-created` нет.
- Вторичное окно уникально по ключу: `windows.create({ ...base(), key, persist, ... })` в `app/shell/index.ts`, своей Map нет, дедупликацию держит ядро; показ - ядро (`show` по умолчанию `'ready'`), геометрия - `persist`.
- Главное окно открывает `shell.main.open()` с `show: 'content'`: окно показывается по `windows.ready()` из `Layout` или по таймауту 10 с ядра. `windows.create` резолвится после показа, окно, закрытое до показа, отклоняет с `unavailable`; страница, чей `ready()` ждёт данных, которые main отдаёт только после возврата `create`, упрётся в таймаут.
- Splash открывает `shell.splash.open()` (один промис на `start` модуля и `shell.main.open`), показывает его ядро после версии и логотипа; статусы - `shell.splash.update` (50 в `catalog`, 70 в `updater`, 90 в `shell.main.open`). `executeJavaScript` в `app/` запрещён (правило 3.22). Закрывает splash `shell.main.open`; при фатальном старте `ready()` в `main.ts` зовёт `shell.splash.close()` и бросает `unavailable` (проверка `kernel.status(sourcesModule | catalogModule)`): окно "Ошибка запуска" показывает ядро.
- Close-гварды: окно с правками создаётся с `confirmClose: true` (`app/shell/index.ts`), страница отвечает через `useCloseRequest`: `false` оставляет окно, `windows.close()` закрывает без вопроса; без ответа за 5 с ядро закрывает окно. Своих событий и каналов запроса и ответа у приложения нет.
- `events.emit` без опций шлёт всем окнам, `{ target }` - одному, `{ except }` - всем кроме одного; оба сразу - ошибка типов. Новое событие - строка в блоке `EventMap` (`shared/types/app-events.ts`).
- У каждого окна свой renderer: между окнами состояние ходит событиями main. Вторичные окна рендерятся вне `Layout`.

## Ловушки

- Привязка канала ядром (kernel) на занятый канал бросает: регистратор вызывается ровно один раз.
- Новая настройка - ключ в схеме `shared/settings.ts` с `.default()` (вложенный объект - `.prefault({})`, иначе `settings.configure` бросит `validation`); тип и дефолты выводятся из схемы через `Register`, ручной карты нет. Только для уровня settings: выбор пользователя, нужен main или нескольким окнам. След интерфейса - `state` (`docs/architecture.md`, раздел уровней хранения).
- Статический ресурс в пакете - запись в `extraResources` (`electron-builder.json`) и член namespace `paths` в `app/utils/paths.ts`.
- Лог версий - `docs/versions/release.md`: канал `updater:changelog:get`, путь - `paths.changelog` (dev `docs/versions`, пакет `resources/versions` из `extraResources`), экран и диалог после обновления - `src/shell/update`; формат раздела и процесс - CLAUDE.md, раздел 9, устройство - `docs/architecture.md`, раздел "Версии и лог". Файлы лога пишет `/notes`, не руками.
- `updater` поверх шаблона: ручная проверка `updater:refresh` ограничена (5 мин между проверками, не более 4 в час, отказ `rate_limited`); флаг `downloaded` останавливает плановые проверки, а `stop()` модуля зовёт `quitAndInstall` только при скачанном обновлении; `update-not-available` -> событие `updater:checked`. Проверка берёт самый новый релиз из `CONFIG.releases` (два репозитория, приватный - с PAT источника владельца), одна проверка за раз; устройство - `docs/architecture.md`, раздел Исключения.
- `updater` в dev не проверяет обновления (`app.isPackaged`); проверки ждут показа главного окна, иначе события `updater:*` уйдут до подписчиков в `Navbar`; канал один - `latest`.
- При выходе ядро останавливает модули с grace 250 мс - дольше инсталлятор обновления не ждёт; `stopTimeout` модуля заменяет grace.
- `vault` - синглтон ядра (`import { vault } from '@cion-suite/core'`: `get` / `set` / `delete`, все `Promise`; значения и имена ключей шифрует `safeStorage`), создавать и передавать экземпляр не нужно.
- Главное окно с `show: 'content'`, чей `Layout` не зовёт `windows.ready()`, показывается только по таймауту 10 с и пишет warn.

## Стыки

- `expert-renderer` - маршрутизатор `src/app/AppRouter.tsx` берёт экраны сущностей и оболочки; раскладка и правила импортов `src/shell` (shell и entities друг друга не импортируют); `toast.result` и `state` в `src/ui` и `src/lib`.
- `expert-warden` - каналы и события домена, порядок и `needs` модулей домена, схемы аргументов; ты держишь `main.ts`, `paths` и оболочку.

## Типовые задачи

**Новый invoke-канал**
1. Тип в `shared/types/ipc-channels.ts`.
2. Handler: запись карты - функция или `{ args, handle }` со схемой zod на каждый аргумент (`schema` из `shared/schema.ts`; args - недоверенный ввод, `handle` получает разобранные значения, отказ разбора - `validation`); вызывающий - `ipc.caller()`, `event` первым параметром handler не принимает; доменная проверка - `errors.assert`; бросающий handler сам не логирует - журнал ведёт `ipc.configure`; карта - в папке концерна рядом с его `module.ts`.
3. Имя канала = путь в `window` (`'a:b:c'` -> `window.a.b.c`), строки фасада нет: `bridge.expose()` в `app/preload.ts` (без аргументов) строит `window.<ns>.*` из имён каналов и значений. Preload не правится; карта handler'ов - `satisfies IpcHandlers`, опечатка в имени - ошибка TS. Имя канала - по словарю глаголов CLAUDE.md §1 (страж 3.31 в `rules.mjs`).
4. Событие - строка в `EventMap`; `pnpm typecheck`.

**Новое окно**
1. Функция в `app/shell/index.ts` через `windows.create({ ...base(), key, persist, ... })`: ключ, URL страницы - через `paths`; наружу - строка в namespace `shell`. Не в `app/utils` и не мимо `shell`.
2. Маршрут вне `Layout` в `src/app/AppRouter.tsx`; канал открытия - в карте концерна, вызывает `shell.*`.
3. Нужен close-гвард - `confirmClose: true` в опциях окна и `useCloseRequest` на странице.

**Служебная страница shell**
1. Папка `src/shell/<x>/` с `<X>Page.tsx`, раздел - строка в таблице разделов (`sections.ts` в `src/shell/sidebar`), маршрут - в `src/app/AppRouter.tsx`; сущности `shell` не импортирует.

**Новая настройка**
1. Ключ в схеме `shared/settings.ts` с `.default()`; renderer читает через `useSetting`, пишет через `settings.patch`; значение дефолта - только в схеме.

## Output

Список изменённых файлов с пояснением. Новый канал - подтверди совпадение имени в `ipc-channels.ts` и карте `handlers` модуля. Новое событие - строка в `EventMap`. Новое окно - только через `shell`.
