# Cion Warden - дизайн и потоки

## Обзор

Менеджер скриптов. Sidebar всегда присутствует (collapsible icon mode). Шесть разделов: Scripts, Get Scripts, Libraries, Binds, Changelog, Settings.

Источники - не отдельный раздел. Ими управляют через кнопку `[Sources]` в тулбарах Get Scripts, Libraries и Binds; она открывает общий диалог источников (modal).

Устройство кода - `docs/architecture.md` (концерны main, сущности renderer), правила - `CLAUDE.md`, эталон раскладки `src/` - `docs/standard.md`.

---

## Навигация (Sidebar)

```text
Local
  Scripts          /scripts          FileCode2

Sources
  Get Scripts      /get-scripts      Download
  Libraries        /libraries        Library

Misc
  Binds            /binds            Keyboard

Footer (без заголовка группы)
  Changelog        /changelog        ScrollText
  Settings         /settings         Settings
```

Таблица разделов (сайдбар, шапка и роутер читают одну) - `src/shell/sidebar/sections.ts`; маршруты - `src/app/AppRouter.tsx`; корневой путь ведёт на последний открытый раздел (`state.lastRoute`, по умолчанию раздел Scripts).

Иконки + подписи. Активный item - accent. Группы - muted-заголовки, не кликабельны. В footer над меню раздела показывается блок обновления (`SidebarUpdate`).

---

## Источники (Sources)

**Не раздел** - общий диалог (`SourcesButton` -> `SourcesDialog`, часть `manage` сущности `source`), вызывается из тулбаров Get Scripts / Libraries / Binds. Источники - глобальный список, агрегируется всеми тремя разделами.

### Схема источника (Git-репозиторий)

- `url` (например `https://github.com/user/repo`); поддерживается только GitHub.
- `branch` (по умолчанию `main`).
- `name` - выводится из `url` (`repo.name`), вручную не задаётся.
- `isPrivate` - переключатель; Personal Access Token хранится в `vault` ядра (`vault.get/set/delete`, ключ `source:token:<sourceId>`). В списке источников на диске его нет, renderer его не получает.
- `tokenMask` - маска токена или `null` (токена нет), отдаётся renderer'у в `sources:list`; сам токен в renderer не уходит.
- Ожидаемая структура репозитория:

  ```text
  scripts/          скрипты (.ahk, AutoHotkey v1)
  scripts/cfg/      конфиги скриптов: cfg_<файл скрипта>.ahk (include скрипта)
  scripts/<папка>/  общие файлы скриптов, например misc/ (include скриптов)
  lib/              библиотеки (файл или папка)
  presets/          пресеты биндов (.ahk)
  assets/fonts/     шрифты источника (+ _fonts.json с описанием)
  ```

  Скрипты, cfg, пресеты и общие файлы - исходники AutoHotkey v1; формат cfg и пресета - раздел "Формат cfg и пресета".

### Раскладка диалога (`SourcesDialog`)

Split-panel modal (`sm:max-w-3xl`, высота `min(520px, 100dvh - 2rem)`):

```text
+-----------------------------------------------------+
|  Sources                                            |  (sr-only title)
+--------------+--------------------------------------+
|  Sources     |  selected.name                       |
+--------------+--------------------------------------+
|  * repo-a    |  url     [_____________________]     |
|    GIT, lock |  branch  [_____________________]     |
|  * repo-b    |  private [o----]                     |
|    GIT       |  token   [**********][edit]          |  (если private)
|              |                                      |
+--------------+--------------------------------------+
|  [+ Add]     |                [Reinstall fonts][Save]|
+--------------+--------------------------------------+
```

- **Левая панель:** список источников. Каждый item - название + бейдж типа (`GIT`) + lock-иконка для private. Hover -> trash-кнопка справа.
- **Правая панель:**
  - Существующий источник -> `SourceSettings` (форма + Save + `Reinstall fonts`).
  - `[+ Add]` -> `NewSourcePanel` (форма нового источника; имя показывается как выводимое из URL).
- **Токен:** при `tokenMask !== null` поле токена блокируется и показывает маску. Карандаш разлочивает поле для нового значения. Токен пишется отдельным вызовом `sources:token:set` после `sources:add` / `sources:update`; при снятии `isPrivate` main удаляет токен сам.
- **Reinstall fonts:** `fonts:install(sourceId)`, итог тостом (`ok`, `skipped`, `failed`).
- **Пустой выбор:** placeholder "Select a source".
- Первый запуск: main создаёт источник по умолчанию, если списка источников ещё нет (seed).

### Синхронизация и GitHub

- Кнопка refresh на страницах Get Scripts / Libraries / Binds - `catalog:sync()` по всем источникам: обновляется manifest (дерево репозитория, sha файлов), после чего списки перечитываются.
- Ошибки GitHub показываются фразой по коду: токен недействителен (`unauthorized`), у токена нет доступа (`forbidden`), репозиторий не найден (`not_found` со статусом 404); прочее - общая фраза и текст main.
- Лимит GitHub API по каждому токену - карточка GitHub API в Settings (`github:limit:get`), обновляется после каждой синхронизации (`github:limit:changed`).
- После успешной синхронизации источника шрифты из `assets/fonts/` устанавливаются в профиль пользователя (только Windows, реестр HKCU); при удалении источника шрифты снимаются.

---

## Страница: Scripts

**Суть:** локальные скрипты из `global_vault/<sourceId>/scripts`. Run/Stop, конфиг, удаление.

### Раскладка

Экран `ScriptsPage` (`src/entities/script/list`). Поисковая строка инжектится в navbar (`useNavbarSearch`). Список - `ListPanel` с прокруткой под тулбаром.

```text
+-------------------------------------------------------+
|  [navbar: ........................ [search]    ]       |
+-------------------------------------------------------+
|  [Stop All]                                    [R]    |
+-------------------------------------------------------+
|  script-one                                           |
|  Modified: 04/05 22:38     [...] [cfg] [> Run]        |
+-------------------------------------------------------+
|  script-two                              (running)    |
|  Modified: 04/05 22:38     [...] [cfg] [# Stop]       |
+-------------------------------------------------------+
```

### Тулбар

- `[Stop All]` - `outline`, disabled если нет запущенных (`scripts:processes:get`). Вызывает `scripts:processes:clear` (убивает все процессы AutoHotkey) и перечитывает признак.
- `[R]` - refresh: `scripts:list` + `scripts:processes:get`.

### Строка (`ScriptRow`)

- **Слева:** `name` (semibold, truncate) + `Modified: MM/DD HH:MM` (если есть `modifiedAt`).
- **Справа (группа):**
  - `[...]` dropdown:
    - `Open in Explorer` -> `scripts:folder:open`
    - `Delete` (destructive) -> confirmation Dialog -> `scripts:delete`
  - `[cfg]` - ghost icon. Disabled, если у скрипта нет `config` (нет `cfg_<файл>.ahk` или в нём нет полей). Открывает `ScriptConfigDialog`.
  - `[> Run] / [# Stop]` - одна кнопка, зависит от `script.status === 'running'`. Run = `default`, Stop = `secondary` (`scripts:processes:remove`).
- **Индикатор состояния:** `border-primary/30` при running; при проверке зависимостей - спиннер и подпись.

### Запуск и зависимости (`deps`)

Перед `scripts:run` renderer зовёт `scripts:deps:get(id)`: main разбирает `#Include` скрипта (`ahk.includes`) и ищет недостающие lib и пресеты в manifest источника. Если чего-то не хватает, показывается `MissingLibsDialog` (список, прогресс): подтверждение последовательно ставит `libs:install` / `binds:install`, затем скрипт запускается; отказ части установок - тост с числом ошибок, запуск не происходит.

Include'ы, которые поставляет сам источник (`scripts/cfg`, общие файлы `scripts/<папка>`, `presets\`), и динамические (`*i`, пути с `%`) в недостающие и неизвестные не попадают.

### Запуск скрипта

`scripts:run` запускает скрипт найденным AutoHotkey v1: `AutoHotkeyU64.exe` / `AutoHotkeyU32.exe` по реестру (`SOFTWARE\AutoHotkey`, `Version` 1.x), по каталогам `v1.*` рядом с v2 или в `Program Files\AutoHotkey`. `AutoHotkey.exe` берётся, только если реестр того же каталога подтвердил v1: это имя есть и у v2. Параметры - `/CP65001 <путь к скрипту>`, без оболочки. Exe не найден - статус `error` с текстом "AutoHotkey v1 is not installed". Путь найденного exe кешируется до его исчезновения.

Скрипт, завершившийся кодом 0 (например `Reload` на Insert), считается запущенным, если процесс с его путём ещё есть в системе: перезапуск - это новый процесс, а не завершение.

### Диалог конфига (`ScriptConfigDialog`, часть `values`)

Modal (`max-w-sm`) с общей формой `ConfigForm` (`src/kit/config-form`): секции из `; @Title` с заголовками, у поля - label, опциональный `[?]` tooltip и редактор по типу:

- `hotkey` - `KeyBindInput` (chip с режимом записи клавиши или кнопки мыши); значение может быть пустым;
- `number` - numeric Input;
- `string` - text Input.

Значения берутся из `cfg_<файл>.ahk`: `scripts:config:get(id)` читает схему с текущими `field.value` при каждом открытии (кеша нет). Правки копятся в форме; `[Save]` (`scripts:config:save(id, values)`) пишет значения прямо в присваивания файла (остальной текст и скрытые константы не меняются), затем схема перечитывается и правки сбрасываются. Reset нет: значений по умолчанию отдельно от файла не хранится.

### Наблюдение за каталогом

- Main: `fs.watch(global_vault, { recursive: true })`, дебаунс 150 мс; событие `script:changed { type: 'change' | 'unlink', filePath }`.
- Renderer: `useQuerySync` сбрасывает `scripts:list`, `scripts:processes:get`, `catalog:scripts:list`.
- Статусы: `script:status:changed { id, status, errorMessage? }` обновляет строку в кэше без перечитывания списка.

### Сущность

- `src/entities/script/list` - `ScriptsPage`, `ScriptRow`, `useScripts` (список + признак запущенных).
- `src/entities/script/values` - диалог конфига скрипта (форма - `src/kit/config-form`).
- `src/entities/script/deps` - проверка и установка недостающего перед запуском.

---

## Страница: Get Scripts

**Суть:** агрегат удалённых скриптов из всех источников. Download / Update / показ статуса.

### Раскладка

Экран `GetScriptsPage` (`src/entities/script/catalog`) + `SourcesButton`. Поиск - в navbar.

```text
+-------------------------------------------------------+
|  [navbar: ........................ [search]    ]       |
+-------------------------------------------------------+
|  [Sources]                                     [R]    |
+-------------------------------------------------------+
|  script-one                                           |
|  user/my-repo                            [v Get]      |
+-------------------------------------------------------+
|  script-two                                           |
|  user/my-repo            [Update available] [v Update]|
+-------------------------------------------------------+
|  script-three                                         |
|  user/my-repo                            [Up to date] |
+-------------------------------------------------------+
```

### Тулбар

- `[Sources]` - `outline`, открывает диалог источников.
- `[R]` - `catalog:sync()` по всем источникам, затем перечитывание списков; тост "готово" при непустом результате, ошибки GitHub - по коду (см. выше).

### Строка (`CatalogScriptRow`)

- **Слева:** `name` (semibold) + `sourceName` (muted).
- **Справа (группа):**
  - Бейдж `Update available` (`destructive`), если `hasUpdate`.
  - Кнопка действия:
    - `!isDownloaded` -> `[v Get]` (`default`)
    - `isDownloaded && hasUpdate` -> `[v Update]` (`outline`)
    - `isDownloaded && !hasUpdate` -> `[Up to date]` (`ghost`, disabled)

### Поток скачивания

`catalog:scripts:install(sourceId, fileName)` качает в `global_vault/<sourceId>/scripts`:

1. `cfg/cfg_<файл>` (если есть в источнике). Значения рабочего cfg переходят в новый файл по имени переменной; сбой скачивания валит установку: скрипт без cfg не загрузится.
2. Общие файлы `scripts/<папка>/**` (`misc/` и подобные), если их нет или их версия отличается.
3. Сам скрипт, последним. Версии записываются одним вызовом после успеха всех файлов.

Main событие не эмитит; renderer после успеха сбрасывает `catalog:scripts:list` и `scripts:list` (позже придёт `script:changed` от watcher). Тост успеха.

**Обновление** перезаписывает скрипт, lib и пресет целиком: ручные правки в них теряются. Значения cfg и пресета при этом переносятся в новый файл по имени переменной (без учёта регистра): новое поле приходит со значением из репозитория, подписи, подсказки, секции и порядок - из нового файла, исчезнувшая переменная отбрасывается. Следствие: новое значение по умолчанию из репозитория не доходит до поля, которое пользователь не трогал.

### Семантика синхронизации

- `sources:list` - текущие источники.
- `catalog:scripts:list()` - агрегат всех источников по сохранённому manifest; `catalog:scripts:list(sourceId)` - один источник.
- `catalog:sync(sourceId?)` - свежий листинг (GitHub API, etag, TTL 30 с); `hasUpdate` считается при чтении списка: запись о скачанной версии (файл `global_vault/<sourceId>/.versions.json`) против `sha` в manifest. Правка скачанного файла пользователем `hasUpdate` не вызывает: содержимое локальных файлов не сравнивается. cfg скрипта сам обновления не вызывает (кроме случая, когда рабочего cfg нет), пресет версионируется отдельно. Общие файлы `scripts/<папка>` общие для всех скриптов источника: их изменение в репозитории помечает `hasUpdate` у всех установленных скриптов.

---

## Страница: Libraries

**Суть:** агрегат библиотек из всех источников. Download / Update / Delete локальных копий, bulk-download, `[...]` row-menu.

### Раскладка

Экран `LibrariesPage` (`src/entities/library/list`).

```text
+-------------------------------------------------------+
|  [navbar: ........................ [search]    ]       |
+-------------------------------------------------------+
|  [Sources]            [v Download All]         [R]    |
+-------------------------------------------------------+
|  FindText                                             |
|  user/my-repo                            [v Download] |
+-------------------------------------------------------+
|  headers                                              |
|  user/my-repo            [Update available] [v Update]|
+-------------------------------------------------------+
|  json                                                 |
|  user/my-repo                       [...] [v Update]  |
+-------------------------------------------------------+
|  key_decode                                           |
|  user/my-repo                       [...] [ok Latest] |
+-------------------------------------------------------+
```

### Тулбар

- `[Sources]` - общий диалог источников.
- `[v Download All]` - `outline`; `libs:sync()` качает не скачанные lib и lib с обновлением (актуальные не перекачиваются, правки пользователя в них не затираются); disabled, если все lib уже скачаны (обновление отдельной lib - кнопка в её строке) или идёт операция. Итог тостом (`ok` / `failed`).
- `[R]` - `catalog:sync()`, как в Get Scripts.

### Строка (`LibraryRow`)

- **Слева:** `name` (semibold) + `sourceName` (muted).
- **Справа (группа):**
  - Бейдж `Update available`, если `hasUpdate`.
  - `[...]` dropdown (только если `isDownloaded`):
    - `Open local folder` -> `libs:folder:open`
    - `Open in browser` -> `libs:web:open` (если есть `webUrl`)
    - `Delete local` (destructive, confirmation) -> `libs:delete`
  - Кнопка действия:
    - `!isDownloaded` -> `[v Download]` (`default`)
    - `isDownloaded && hasUpdate` -> `[v Update]` (`outline`)
    - `isDownloaded && !hasUpdate` -> `[ok Latest]` (`ghost`, disabled)

Операции над lib и пресетами (install / remove / openFolder / sync, тосты, занятые строки, инвалидация) общие для Libraries и Binds: модуль `src/kit/catalog-actions`, различия - конфигом.

---

## Страница: Binds

**Суть:** глобальные пресеты с биндами и значениями для скриптов. Пресеты - `.ahk`-файлы источников (`presets/`), копии - в `global_vault/<sourceId>/presets`; значения пользователя хранятся прямо в этих копиях.

### Два режима

#### Режим A: один пресет и он скачан

Сразу показывает форму пресета (без сетки).

#### Режим B: иначе

Сетка карточек пресетов (`BindCard`) с тулбаром `[Sources]`, `[v Download All]` (`binds:sync()`), refresh. Карточка: имя; у скачанного - меню (Update при `hasUpdate`, open folder, delete), у нескачанного - кнопка Download. Пустой список - empty state.

```text
+-------------------------------------------------------+
|  Binds                          [Sources] [v Download]|
+-------------------------------------------------------+
|  +--------------+  +--------------+                   |
|  |  keybinds    |  |  hotkeys     |                   |
|  |  my-repo     |  |  my-repo     |                   |
|  +--------------+  +--------------+                   |
+-------------------------------------------------------+
```

Клик по скачанной карточке -> форма пресета; назад - через крошку в navbar (`Binds / name`).

```text
+-------------------------------------------------------+
|  Binds / keybinds                                     |
+-------------------------------------------------------+
|  +-------------------------------------------------+  |
|  |  keybinds                                       |  |
|  |  Attack         [  F1  ]                        |  |
|  |  Defend         [  F2  ]                        |  |
|  |  Delay (ms)     [ 1000 ]                        |  |
|  |                                      [Save]    |  |
|  +-------------------------------------------------+  |
+-------------------------------------------------------+
```

### Форма пресета (часть `form`)

- Секции и поля выводятся из `.ahk` пресета (раздел "Формат cfg и пресета"); форма - общая `ConfigForm` (`src/kit/config-form`), та же, что в диалоге конфига скрипта. Тип поля: `hotkey` - `KeyBindInput`, `number` - numeric Input, `string` - text Input.
- Клик по `[F1]` -> chip в режиме "нажми клавишу" -> клавиша или кнопка мыши записываются в черновик. Пустой бинд допустим.
- Изменения копятся в форме; `[Save]` (`binds:values:save`) пишет значения прямо в присваивания рабочего `presets/<файл>.ahk`, после чего схема перечитывается и правки сбрасываются. Reset нет: значений по умолчанию отдельно от файла не хранится.
- Схема со значениями - `binds:schema:get` (`ConfigSchema`, текущее значение - в `field.value`; `null`, если пресета нет на диске; пресет без полей - подсказка).

### Формат значений

Ключ значения - имя переменной AHK без учёта регистра, плоский для всех секций. Значение - конечное число или строка без перевода строки.

---

## Формат cfg и пресета (AutoHotkey v1)

Один парсер (`ahk.parse` в `app/utils/ahk.ts`) читает cfg скрипта (`scripts/cfg/cfg_<файл>.ahk`) и пресет (`presets/<файл>.ahk`) и выдаёт `ConfigSchema` (секции -> поля). Правка значений (`ahk.patch`) меняет только значение в строке присваивания.

**Поле** - три строки подряд:

```text
; @Tooltip <текст>          необязательна
; @Bind                     или ; @Value
Name = value ; label        (legacy)  либо  Name := 300
```

- **Секции.** `; @Title X` открывает секцию до следующего `@Title`; поля до первого `@Title` попадают в безымянную секцию.
- **Label** - хвост строки после комментария: у `=` это первое `[ \t];`, у `:=` первая `;` вне кавычек. Нет хвоста - label равен имени переменной.
- **Тип поля.** `@Bind` -> `hotkey`; `@Value` с числом -> `number`, иначе `string`.
- **Скрытая константа.** Присваивание без аннотации (`Abil_2_Cooldown := 5000`) в форме не показывается и в файле сохраняется байт-в-байт.
- **Режим файла.** Строгий, если есть хотя бы одна `@Bind` или `@Value`; тогда полями являются только аннотированные присваивания. Иначе свободный (типичный пресет): каждое присваивание - поле (число -> `number`, остальное -> `hotkey`), строка-комментарий над группой присваиваний - заголовок секции. Первая `@Bind` в пресете превращает остальные присваивания в скрытые константы: их значения при обновлении не переносятся.
- **Ключ поля** - имя переменной, без учёта регистра. Повтор имени - первое вхождение, предупреждение в лог.
- **Запись.** Сохраняются BOM, перевод строки (CRLF / LF), выравнивание, оператор `=` / `:=`, хвостовой комментарий, отсутствие финального перевода строки. В значении при `=` экранируются `;`, `%` и backtick (backtick'ом); при `:=` число пишется как есть, строка - в кавычках. Поля `:=` с выражением без кавычек (`false`, `A_ScreenWidth`) при переносе значений не затрагиваются: остаётся значение нового файла.

Те же правила для `ahk.merge`, который переносит значения старого рабочего файла в новый при обновлении.

---

## Страница: Changelog

Раздел "Что нового" (`#/changelog`, `src/shell/update`): карточки версий из `docs/versions/<канал>.md` (`updater:changelog:get`), текущая версия подсвечена. После обновления один раз открывается диалог с разделами между прошлой показанной и текущей версией. Устройство - `docs/architecture.md`, раздел "Версии и лог".

---

## Страница: Settings

Экран `SettingsPage` (`src/shell/settings`), стек карточек:

- **Appearance** - тема (`light` / `dark` / `system`, по умолчанию `dark`), `settings.theme`.
- **Language** - язык интерфейса (`en` / `ru`), `settings.locale`.
- **GitHub API** - лимит запросов по каждому сохранённому токену и анонимный (`github:limit:get`), прогресс-бар, время сброса; ручной refresh. Сбой пробы одного токена - строка с ошибкой, не отказ карточки.
- **Updates** - версия приложения, канал (latest / beta, `settings.updaterBeta`), проверка обновлений, загрузка и установка. Ручная проверка ограничена: не чаще раза в 5 минут и 4 раз в час.

Планируется (в коде нет): пути папок скриптов и библиотек (browse-кнопки), кнопка `Manage Sources`.

---

## Модель данных

Все интерфейсы - в `shared/types/` (видны main и renderer через `@shared/types`); источник правды - файлы, ниже только форма.

```ts
// shared/types/sources.ts
export interface Source {
    id: string;
    type: 'git';
    name: string;
    url: string;
    branch: string;
    isPrivate: boolean;
    tokenMask: string | null; // маска токена, сам токен в renderer не уходит
}
```

```ts
// shared/types/scripts.ts
export type ScriptStatus = 'idle' | 'running' | 'error';

export interface Script {
    id: string; // sha1(путь).slice(0, 16)
    name: string;
    filePath: string;
    config?: ConfigSchema; // поля cfg_<файл>.ahk; нет файла или полей - не задан
    status: ScriptStatus;
    errorMessage?: string;
    modifiedAt?: number;
}
```

```ts
// shared/types/catalog.ts
export interface CatalogScript {
    id: string;
    name: string;
    fileName: string;
    sourceId: string;
    sourceName: string;
    sha?: string; // sha файла в репозитории (manifest)
    isDownloaded: boolean;
    hasUpdate: boolean;
    downloadUrl?: string;
}

export interface SourceSync {
    sourceId: string;
    lastSyncedAt: number;
    fromCache: boolean; // TTL-попадание или 304
}
```

```ts
// shared/types/config.ts: общая форма cfg скрипта и пресета
export type ConfigFieldType = 'hotkey' | 'number' | 'string';

export interface ConfigField {
    key: string; // имя переменной AHK, без учёта регистра
    label: string;
    type: ConfigFieldType;
    value: string | number; // текущее значение в файле
    tooltip?: string;
}

export interface ConfigSection {
    title: string; // пусто у полей до первого @Title
    fields: ConfigField[];
}

export interface ConfigSchema {
    sections: ConfigSection[];
}

export type ConfigValues = Record<string, string | number>;
```

`Lib` (`libs.ts`: `kind: 'file' | 'folder'`, `files`, `webUrl`), `Bind` (`binds.ts`), `ScriptDeps` (`script-deps.ts`: `missing`, `unknown`), `GithubLimit` и `GithubRepo` (`github.ts`), `Font` и `FontInstall` (`fonts.ts`) - по тем же правилам.

---

## IPC-контракты

Имя канала = путь в `window` (`'scripts:processes:get'` -> `window.scripts.processes.get()`); канал объявляется один раз в `shared/types/ipc-channels.ts`, обработчики - карты `handlers` концернов `app/<концерн>/handlers.ts` (бросают ошибки, аргументы описаны zod-схемами `shared/schema.ts`). Главный список с типами - `IpcChannelMap`.

```text
// scripts (локальные)
scripts:list                  ()                    -> Script[]
scripts:run                   (id)                  -> void
scripts:delete                (filePath)            -> void
scripts:processes:get         ()                    -> boolean          // есть ли запущенные
scripts:processes:remove      (id)                  -> void             // остановить скрипт
scripts:processes:clear       ()                    -> void             // остановить все
scripts:folder:open           (filePath)            -> void
scripts:config:get            (id)                  -> ConfigSchema | null   // нет cfg - null
scripts:config:save           (id, values)          -> void
scripts:deps:get              (id)                  -> ScriptDeps

// sources
sources:list                  ()                    -> Source[]
sources:add                   (options)             -> Source
sources:update                (sourceId, options)   -> Source
sources:remove                (sourceId)            -> void
sources:token:set             (sourceId, token)     -> void
sources:token:remove          (sourceId)            -> void

// github
github:limit:get              ()                    -> GithubLimit
github:repo:get               (sourceId)            -> GithubRepo       // репозиторий глазами токена

// catalog (удалённые скрипты и синхронизация)
catalog:sync                  (sourceId?)           -> SourceSync[]
catalog:scripts:list          (sourceId?)           -> CatalogScript[]
catalog:scripts:install       (sourceId, fileName)  -> void

// libs
libs:list                     (sourceId?)           -> Lib[]
libs:install                  (sourceId, libId)     -> void
libs:sync                     (sourceId?)           -> LibSync          // { ok, failed }
libs:delete                   (sourceId, libId)     -> void
libs:folder:open              (sourceId, libId)     -> void
libs:web:open                 (sourceId, libId)     -> void

// binds (пресеты)
binds:list                    (sourceId?)           -> Bind[]
binds:install                 (sourceId, presetId)  -> void
binds:sync                    (sourceId?)           -> BindSync
binds:delete                  (sourceId, presetId)  -> void
binds:folder:open             (sourceId, presetId)  -> void
binds:schema:get              (sourceId, presetId)  -> ConfigSchema | null   // значения - в field.value
binds:values:save             (sourceId, presetId, values: ConfigValues) -> void

// fonts (Windows)
fonts:list                    ()                    -> Font[]
fonts:install                 (sourceId)            -> FontInstall
fonts:remove                  (sourceId)            -> void

// updater
updater:refresh               ()                    -> void
updater:install               ()                    -> void
updater:changelog:get         ()                    -> string | null
```

Значение main -> renderer (синхронно): `window.app.env` (`IpcValueMap['app:env']`: `isDev`, `username`, `version`).

---

## События

Единый канал ядра. Main: `events.emit(name, payload)` (всем окнам). Renderer: `useEvent(name, handler)` / `events.on`. Типы - `EventMap` в `shared/types/app-events.ts`. **Никогда** `win.webContents.send()`.

```text
source:changed          { sourceId, type: 'add' | 'update' | 'remove' }
source:synced           SourceSync
github:limit:changed    { remaining, reset }
lib:changed             { sourceId, libId }            // libId '*' - все lib источника
bind:changed            { sourceId, presetId }         // presetId '*' - все пресеты источника
script:changed          { type: 'change' | 'unlink', filePath }
script:status:changed   { id, status, errorMessage? }
updater:checked         void                           // новее версии нет
updater:available       UpdaterInfo
updater:progress        UpdaterProgress
updater:downloaded      UpdaterInfo
updater:failed          { message }
```

Кэш react-query сбрасывает `useQuerySync` (таблица - `docs/architecture.md`, раздел "Данные и инвалидация").

---

## Размещение в коде

### Renderer (`src/`)

```text
src/
|-- app/                     AppRouter, AppProvider, стили
|-- shell/                   layout, navbar, sidebar, settings, update
|-- entities/
|   |-- source/   manage/ (SourcesButton, диалог), sync/ (useSourcesSync)
|   |-- script/   list/ (ScriptsPage), catalog/ (GetScriptsPage), values/ (ScriptConfigDialog), deps/
|   |-- library/  list/ (LibrariesPage)
|   `-- bind/     grid/ (BindsPage), form/ (PresetForm)
|-- kit/catalog-actions/     install / remove / openFolder / sync для library и bind
|-- kit/config-form/         форма полей ConfigSchema: диалог скрипта и форма пресета
|-- ui/                      shadcn, ListPanel, ListRow, ConfirmDialog, KeyBindInput, toast, ...
`-- lib/                     state, i18n, hooks (useQuerySync, useInvalidate, useBusy), navbar, github-error
```

### Main (`app/`)

Концерны `shell`, `sources`, `github`, `catalog`, `fonts`, `libs`, `binds`, `scripts`, `updater`; описание, `needs` и владение каналами - `docs/architecture.md`, раздел Backend.

---

## Проверка

- `pnpm dev` -> шесть разделов открываются без ошибок.
- Scripts: добавление файла в папку источника -> строка появляется без refresh; удаление -> исчезает.
- Run/Stop: кнопка переключается; при ошибке скрипт получает `status: 'error'` + `errorMessage`; недостающие lib предлагаются к установке перед запуском.
- `Stop All` disabled, пока нет запущенных.
- Запуск: без AutoHotkey v1 - статус `error` "AutoHotkey v1 is not installed"; с ним скрипт стартует через найденный `AutoHotkeyU64.exe` / `AutoHotkeyU32.exe`.
- Диалог конфига: открывается только при наличии `config`; hotkey-chip перехватывает нажатие; Save вызывает `scripts:config:save` и пишет значения в `cfg_<файл>.ahk`.
- Обновление скрипта: значения cfg переносятся в новый файл, правка скачанного скрипта `hasUpdate` не вызывает.
- Диалог источников: add git (private + token) -> `sources:add` + `sources:token:set`; маска видна после reopen; разлоченный токен сохраняется заново.
- Get Scripts / Libraries / Binds: refresh -> `catalog:sync` по всем источникам; ошибки токена и доступа дают правильную фразу; Download -> строка переходит в "Up to date" / "Latest".
- Binds: Save пишет значения в `presets/<файл>.ahk`; Update пресета сохраняет значения пользователя.
- `pnpm typecheck` -> 0 ошибок; `pnpm lint` -> 0 нарушений boundaries; `pnpm test` зелёный.
