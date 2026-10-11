Completion steps (после каждой фазы)

1. pnpm typecheck (затронуты и src/, и app/).
2. pnpm lint
3. pnpm test
4. /isgood - adversarial review + fix-loop.
5. /notes - лог версии и commit-сообщение (uncommitted mode).
6. Отметить фазу [done] в docs/planned-now.md.
7. STOP & WAIT - подтверждение перед следующей фазой.

---

## Миграция warden на AHK v1 (wf-macro)

Контекст. Источник `wf-macro` (HEAD `60023c8`) вернулся на AutoHotkey v1:

- конфиг скрипта - `scripts/cfg/cfg_<файл>.ahk`, подключается `#include cfg\cfg_%A_Scriptname%`;
- пресет - `presets/game_settings.ahk`;
- служебные `scripts/misc/*.ahk` подключаются через include.

Warden ждёт v2: `cfg/<имя>.json`, JSON-пресеты, `*.values.json`. `misc/` не скачивает, скрипты запускает через ассоциацию `.ahk`.

Решения:

- значения пользователя пишутся прямо в скачанные `.ahk`, wf-macro не правится;
- запуск идёт найденным AutoHotkey v1;
- пустой бинд допустим;
- форма конфига и пресета - общий модуль `src/kit/config-form`;
- поддержка JSON v2 удаляется без совместимости.

Допущение "оригинал рядом". При скачивании cfg и пресета копия из репо ложится в `global_vault/<id>/.origin/<тот же путь>`. Из неё:

- значения по умолчанию и сброс;
- `hasUpdate` - sha оригинала, а не изменённого рабочего файла.

При обновлении в новый файл переносятся только поля, которые пользователь менял относительно старого оригинала.

Правила механизма (закрывают крайние случаи):

- **Рабочий есть, оригинала нет** (файл скачан до Phase 3). Чтение (`read`, metas) берёт рабочий вместо оригинала и ничего не пишет: у `scripts:list` и событий watcher побочных эффектов нет. Копия в `.origin/` создаётся только операцией записи (`save`, `reset`, `install`) перед её основной записью.
- **Порядок записи в `install`** - один для всех случаев:
  1. Оригинала нет, а рабочий есть -> рабочий копируется в `.origin/` (он и есть старый оригинал).
  2. Новый рабочий: новый оригинал + перенос изменённых значений.
  3. Новый оригинал - последним, это точка фиксации.
  - Упал шаг 2 или 3 -> sha оригинала старый, `hasUpdate` остаётся true, обновление повторится.
  - Первая установка (нет ни того, ни другого) и сбой на шаге 3 -> рабочий без оригинала. Его содержимое - чистый файл репо, чтение законно берёт его за оригинал.
  - Принятая цена: файл, вручную правленный между Phase 2 и Phase 3, станет оригиналом как есть (v1-файлы появляются только с Phase 2, окно - dev-сборки).
- **Metas.** `isDownloaded` - рабочий файл существует (без него скрипт падает на `#include`). `hasUpdate` - sha оригинала, без оригинала - sha рабочего, против sha в manifest. Оригинал без рабочего -> не скачан, `binds:sync` перекачает.
- **`save(file, values)` = `ahk.patch(рабочий, полные значения)`**, где полные значения - каждое поле схемы: `values[key]`, иначе default из оригинала. Renderer шлёт только отличия (`strip`, `src/entities/bind/form/preset-values.ts:18-26`): без дополнения поле, возвращённое к default, осталось бы в рабочем со старым значением. Ручные правки рабочего вне полей не трогаются: комментарии, скрытые константы, строки без аннотации.
- **`install` строит новый рабочий из нового оригинала.** Ручные правки вне полей при обновлении теряются - это цена, в `/notes` не скрывать.
- **Сериализация.** Чтение-правка-запись одного рабочего файла идёт по очереди на путь: `save`, `install`, `reset` и `binds:sync` не гоняются.
- **Ошибки чтения оригинала.** Только `ENOENT` значит "нет файла". Иные ошибки (`EBUSY`, `EACCES`) логируются и не превращаются в "не скачан", иначе sync перекачает поверх правок.

Формат v1, который понимает парсер:

- **Поле** - три строки подряд:
  - `; @Tooltip <текст>` - необязательна;
  - `; @Bind` или `; @Value`;
  - присваивание: `Name = value ; label` (legacy) или `Name := 300`.
- **Секции.** `; @Title X` открывает секцию до следующего `@Title`; поля до первого `@Title` попадают в неявную секцию.
- **Скрытая константа.** Присваивание без аннотации (`Abil_2_Cooldown := 5000`) - в UI его нет, в файле сохраняется байт-в-байт.
- **Label** - хвост строки после первого `[ \t];` без backtick перед ним. Нет хвоста - label = имя переменной.
- **Режим** строгий, если в файле есть `@Bind` или `@Value`. Иначе свободный (пресет):
  - каждое присваивание - поле;
  - строка-комментарий над группой присваиваний - заголовок секции.
- **Тип поля:**
  - `@Bind` -> hotkey;
  - `@Value` с числом -> number, иначе string;
  - свободный режим: число -> number, иначе hotkey.
- **Ключ поля** - имя переменной AHK, без учёта регистра. Повтор имени - первое вхождение, warn в лог.
- **Смена режима между версиями** (первая `@Bind` в пресете превращает остальные присваивания в скрытые константы) теряет перенос их значений. Принято: перенос идёт только по полям новой схемы.
- **Файлы:**
  - BOM у 8 из 9 cfg;
  - CRLF и LF;
  - финального перевода строки нет;
  - значения `[` и `]` легальны;
  - при записи `;` `%` и backtick экранируются backtick'ом.

### Phase 1: Namespace `ahk` в `app/utils`, парсер и writer v1 [done]
- **What:** чистые функции без fs:
  - `ahk.parse(text) -> ConfigSchema` - строгий и свободный режимы;
  - `ahk.patch(text, values) -> string` - меняет только значение в строке присваивания;
  - `ahk.includes` - снимает BOM, режет комментарий по `[ \t];`, понимает `*i` и `%A_ScriptDir%`.
- **Where:**
  - `app/scripts/ahk.ts` -> `app/utils/ahk.ts` (move);
  - `tests/app/scripts/ahk.test.ts` -> `tests/app/utils/ahk.test.ts` (move);
  - `shared/types/config.ts` (create): `ConfigFieldType`, `ConfigField`, `ConfigSection`, `ConfigSchema`, `ConfigValues`;
  - `shared/types/index.ts` (modify).
- **How:**
  - Перенос - `node .claude/scripts/mv.mjs`.
  - Место в `app/utils`: парсер нужен `catalog`, `binds` и `scripts`.
  - `patch` сохраняет: BOM, EOL, выравнивание, оператор `=` / `:=`, хвостовой комментарий, скрытые константы, отсутствие финального перевода строки.
  - Для `=` экранирует `;` `%` и backtick; для `:=` пишет число или строку в кавычках.
  - Тесты на реальных образцах:
    - BOM, CRLF и LF;
    - `aimKey = [`, `Abil_2_Cooldown := 5000`;
    - label после таба;
    - ложный заголовок пресета, повтор имени;
    - идемпотентность `parse(patch(t, v))`.
- **Reuse:**
  - существующий `ahk` (`app/scripts/ahk.ts:35`) расширяется, новый namespace не заводится;
  - форма `ConfigSchema` повторяет `PresetSchema` (`shared/types/binds.ts:1-28`), но без типа `boolean` - в v1 его нет.
- **Depends on:** -

### Phase 2: Доставка v1 и запуск через AutoHotkey v1
- **What:** v1-скрипт после установки из Get Scripts запускается:
  - скачиваются `cfg_<файл>`, `scripts/misc/**` и `.ahk`-пресеты;
  - запуск идёт найденным AutoHotkey v1.
- **Where:**
  - `app/catalog/derive.ts` (modify):
    - вложенные файлы `scripts/<папка>/**`, кроме `cfg/`, идут в новый список manifest `support`;
    - пресеты отбираются по `.ahk`;
    - исключение `.values.json` убирается.
  - `app/catalog/types.ts`, `app/catalog/manifest.ts` (modify): поле `support`, `MANIFEST_VERSION` +1.
  - `app/catalog/install.ts` (modify):
    - cfg ищется по имени `cfg_${fileName}` в `manifest.cfgs`;
    - `support`-файлы докачиваются, если sha отличается.
  - `app/catalog/metas.ts` (modify): `hasUpdate` скрипта учитывает `support` - недостающий или изменённый файл.
  - `app/scripts/deps.ts` (modify): include с `*i`, `presets\`, `support`-пути и пути с `%` не попадают в `unknown`.
  - `app/scripts/watcher.ts` (modify): каталог `scripts/misc` не скрипт, `script:changed` по нему не шлётся. Сейчас `isScript` (`watcher.ts:17-19`) берёт любой путь из 3 сегментов: каталоги `scripts/cfg` и `scripts/misc` проходят как скрипты, файлы внутри них (4 сегмента) - нет.
  - `app/scripts/index.ts` (modify при необходимости): `scripts:list` не видит вложенные папки.
  - `app/scripts/handlers.ts` (modify): `scripts:delete` удаляет и `cfg/cfg_<файл>`. `support`-файлы удаляются, когда у источника не остаётся установленных скриптов.
  - `app/scripts/processes.ts` (modify):
    - внутренняя `locate()` ищет exe по порядку:
      1. `reg query` ключа `SOFTWARE\AutoHotkey` в `HKLM`, `HKLM\SOFTWARE\WOW6432Node` и `HKCU`: `Version` 1.x -> `InstallDir`;
      2. `InstallDir\v1.*\` (v1 рядом с v2);
      3. `%ProgramFiles%\AutoHotkey`, `%ProgramFiles(x86)%\AutoHotkey`.
    - Кандидаты: `AutoHotkeyU64.exe`, `AutoHotkeyU32.exe` - эти имена бывают только у v1. `AutoHotkey.exe` - только если реестр того же каталога подтвердил `Version` 1.x: у v2 это имя тоже есть.
    - Запуск - `spawn(exe, ['/CP65001', filePath])` без `shell`. Путь передаётся аргументом, кавычки и пробелы в `%APPDATA%` безопасны.
    - `cmd.allows` в `run` больше не нужен: путь не идёт в cmd, а guard отвергал бы легальные `(` и `&` в имени пользователя. Путь по-прежнему ограничивает `scripts.path` / `fsx.confine`. Остальных пользователей `shared/cmd.ts` проверить через `map.mjs`.
    - Exe не найден -> статус `error` с текстом `errors.fail('unavailable', ...)`.
    - **Reload.** Теперь дочерний процесс - сам AHK, а не cmd. `Reload` (Insert, `scripts/misc/misc.ahk:7`) завершает отслеживаемый pid с кодом 0, а новый экземпляр - другой процесс. На `exit` с кодом 0 статус ставится по probe процессов (поиск по CommandLine): скрипт ещё жив -> `running`. Покрыть тестом.
    - Probe начатый до `exit` не должен вернуть мёртвый pid в `osPaths` после `drop()` (`processes.ts:68-77`): результат старого запроса отбрасывается по счётчику поколений.
  - Тесты:
    - `tests/app/catalog/{derive,install,metas,manifest,sync}.test.ts`;
    - `tests/app/scripts/{deps,processes,watcher,index}.test.ts`.
- **How:**
  - `support` устроен как `cfgs`: `ManifestFileEntry` с относительным путём, каждый сегмент проверяется `isName`.
  - Реестр читается через `reg.exe`, как в `app/fonts/registry.ts`.
  - `/CP65001` повторяет ассоциацию `.ahk`: `cfg_sculptor_updater.ahk` сохранён в UTF-8 без BOM.
  - Trade-off `support`: файлы общие для всех скриптов источника. Правка `misc/*` в репо помечает `hasUpdate` у всех установленных скриптов. Обновление одного скрипта меняет `misc` и под остальными. Принято: `misc` - общий рантайм источника, как `lib`.
  - Между Phase 2 и Phase 3 форма пресета не работает: `.ahk`-пресет уже в каталоге, а `binds/files.ts` ещё читает JSON (`fsx.json.read` -> `validation`). Скачивание и запуск работают. Окно - dev-сборки, отдельно не чиним.
  - cfg в этой фазе ставится без оригинала. Это законно: правило "рабочий есть, оригинала нет" в Phase 3 примет его за оригинал.
- **Reuse:**
  - `fileIn`, `sorted` (`app/catalog/derive.ts`);
  - `github.file`, `fsx.write`, `fsx.confine`;
  - `resolveSha` (`app/catalog/metas.ts:23`);
  - образец `reg.exe` - `app/fonts/registry.ts:45`;
  - `processes.run` (`app/scripts/processes.ts:81`) правится на месте.
- **Depends on:** Phase 1

### Phase 3: Хранение значений в .ahk (оригинал + рабочий файл), пресеты на нём
- **What:**
  - правка пресета пишет значение прямо в `presets/<файл>.ahk`;
  - синхронизация с GitHub правки не затирает;
  - пресеты переходят на `ahk.parse`, JSON-разбор пресетов удаляется.
- **Where:**
  - `app/utils/paths.ts` (modify): `paths.source(id).origin`.
  - `app/catalog/config.ts` (create), экспорт `catalog.config` из `app/catalog/index.ts`:
    - `read(file) -> { schema, values }` - schema из оригинала, values из рабочего файла; оригинала нет -> рабочий вместо оригинала, без записи;
    - `save(file, values)` - рабочий = `ahk.patch(рабочий, values, дополненные default'ами оригинала)`;
    - `reset(file)` - рабочий = копия оригинала;
    - `install(file, content)` - три шага из шапки ("Порядок записи в `install`"): копия рабочего в `.origin/`, если оригинала нет; новый рабочий; новый оригинал последним;
    - очередь на путь для всех четырёх операций (правила механизма - в шапке плана).
  - `app/catalog/metas.ts` (modify): `isDownloaded` и `hasUpdate` пресета - по правилу "Metas" из шапки. В `resolveSha` только `ENOENT` -> `null`, иные ошибки - warn.
  - `app/binds/files.ts` (modify): схема, значения, сброс и загрузка - через `catalog.config`; `remove` удаляет и оригинал.
  - `app/binds/preset.ts` (delete).
  - `shared/types/binds.ts` (modify): `Preset*` удаляются, вместо них `Config*`.
  - `shared/schema.ts` (modify):
    - `isPresetKey` -> проверка идентификатора AHK, исключение `__proto__` и др. остаётся;
    - `schema.preset.values` -> `schema.config.values`, строка без `\r\n`.
  - `shared/types/ipc-channels.ts` (modify): у `binds:*` меняются только типы.
  - renderer (`src/entities/bind/form/**`) - не только переименование типов:
    - ветка `field.type === 'boolean'` (`PresetFieldRow.tsx:39`) удаляется: без `boolean` в `ConfigFieldType` это TS2367;
    - ключ поля меняется с `<секция>.<поле>` на имя переменной, сравнения и `strip` / `equal` проверить.
  - Тесты:
    - `tests/app/catalog/config.test.ts` (create):
      - нет оригинала: `read` не пишет, `save` создаёт копию;
      - сбой на каждом из трёх шагов `install`, с оригиналом и без: после сбоя `hasUpdate` true либо файл не скачан, значения пользователя не стали defaults;
      - оригинал без рабочего -> `isDownloaded` false;
      - `save` с пропущенным ключом возвращает поле к default;
      - параллельные `save` + `install` на одном пути;
      - ручная правка рабочего переживает `save`;
    - `tests/app/binds/{files,handlers}.test.ts`;
    - `tests/app/binds/preset.test.ts` (delete);
    - `tests/shared/schema.test.ts`, `tests/app/utils/paths.test.ts`.
- **How:**
  - `catalog.config` живёт в `catalog`: это предок `binds` и `scripts` в `modules`, граф идёт только вниз.
  - Перенос значений: поле, у которого рабочее значение != старому оригиналу, переносится в новый текст по имени переменной (без учёта регистра).
  - Переменной в новой версии нет -> значение отбрасывается.
- **Reuse:**
  - `fsx.write` (атомарная запись), `fsx.confine`, `resolveSha`;
  - каналы `binds:schema:get` и `binds:values:get/save/reset` остаются, меняются только типы.
  - Новое - `catalog.config`. Механизма "оригинал + рабочий файл" в коде нет (искал в `app/catalog`, `app/binds`, `app/utils`), а нужен он двум концернам.
- **Depends on:** Phase 1, Phase 2

### Phase 4: Конфиг скрипта на `cfg_<файл>.ahk` и общая форма `kit/config-form`
- **What:**
  - диалог конфига скрипта показывает секции `@Title`, подсказки и бинды, значения сохраняет в `cfg_<файл>.ahk`;
  - форма пресета и форма конфига - один модуль kit;
  - остатки v2 удаляются.
- **Where:**
  - main:
    - `app/scripts/index.ts` (modify): `Script.config` из `catalog.config.read(cfg/cfg_<файл>)`, без `configPath`;
    - `app/scripts/handlers.ts` (modify): `scripts:config:get/save/reset` по `id` (`schema.script.id`);
    - `app/catalog/install.ts` (modify): cfg ставится через `catalog.config.install`;
    - `scripts:delete` удаляет и оригинал cfg в `.origin/`;
    - `app/catalog/metas.ts` (modify): скрипт с cfg в manifest - `hasUpdate` по правилу "Metas" из шапки для cfg; рабочего cfg нет -> `hasUpdate` true (скрипт без cfg не загрузится).
  - shared:
    - `shared/types/scripts.ts` (modify): удаляются `HkEntry`, `ValEntry`, `ScriptCfgFile`, `ScriptCfgValues`;
    - `shared/schema.ts` (modify): удаляются `schema.config.path` и `schema.script.values`;
    - `shared/types/ipc-channels.ts` (modify): `scripts:config:*` по `id`, новый `scripts:config:reset`.
  - renderer:
    - `src/kit/config-form/` (create): `index.ts`, `ConfigForm.tsx`, `ConfigFieldRow.tsx`, `config-values.ts`; данные, `save` и `reset` - пропсами;
    - `src/entities/bind/form/*` (modify): на kit, `PresetFieldRow.tsx` и `preset-values.ts` уходят в kit;
    - `src/entities/script/values/*` (modify): вкладки Hotkeys/Values -> секции, `config-values.ts` удаляется;
    - `src/entities/script/list/ScriptRow.tsx` (modify);
    - i18n (modify).
  - Тесты:
    - `tests/src/kit/config-form/config-values.test.ts` (move из `bind/form/preset-values`);
    - `tests/src/entities/script/values/config-values.test.ts` (delete);
    - `tests/app/scripts/{handlers,index}.test.ts`.
- **How:**
  - UI - через `/shadcn`, модуль kit - по `docs/standard.md`.
  - Образец формы - `src/entities/bind/form/PresetForm.tsx:33-49`.
  - Внутри kit файлы не импортируют свой `index.ts`.
  - После правок - `graph.mjs cycles`.
- **Reuse:**
  - в kit переезжают `PresetFieldRow` и `presetValues.defaults/strip/equal` (`src/entities/bind/form/preset-values.ts:8-29`);
  - `KeyBindInput` (`src/ui/KeyBindInput.tsx:20`), `toast.result`, `useInvalidate`;
  - `catalog.config` из Phase 3;
  - образец модуля kit - `src/kit/catalog-actions/`.
- **Depends on:** Phase 3

### Phase 5: Документация и выпуск
- **What:** доки соответствуют v1, лог версии записан.
- **Where:**
  - `docs/app.md`, `docs/architecture.md` (modify);
  - `docs/versions/*` - через `/notes`.
- **How:**
  - `/sync-docs`.
  - В `/notes` отметить:
    - значения v2 сброшены: ключи не совпадают;
    - удалённые из репо v2-скрипты (`delay`, `endo_nidus`) пользователь убирает сам;
    - старые `*.values.json` в `global_vault` не трогаются.
- **Reuse:** `.claude/scripts/doc-refs.mjs` через `/sync-docs`.
- **Depends on:** Phase 4

## Before merge

`/ship` - typecheck + lint + test + скан ветки + циклы импортов + build. Ревью в нём нет - это `/isgood` каждой фазы.
