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
- поддержка JSON v2 удаляется без совместимости;
- оригинала нет: ни `.origin/`, ни значений по умолчанию отдельно от файла. Reset в формах нет.

Схема хранения (закрывает крайние случаи):

- **Версия скачанного** - sha файла в репозитории (из manifest на момент установки). Все версии - в одном `global_vault/<id>/.versions.json`: `{ "<путь от корня источника>": "<sha>" }` для скриптов, `support`, файлов lib и пресетов. Сами файлы не меняются: версия не пишется ни в первую строку, ни в имя.
- **Правки пользователя не влияют на версию.** Правка скрипта, lib, пресета или cfg не вызывает `hasUpdate`: содержимое локальных файлов не хешируется, сравнение - запись из `.versions.json` против sha в manifest.
- **cfg скрипта не версионируется** и на `hasUpdate` не влияет: репо изменил только cfg - обновление не предлагается. Пресет - отдельная сущность, у него своя версия.
- **Обновление перезаписывает файл целиком.** Ручные правки скрипта, lib и пресета теряются - это цена, в `/notes` не скрывать.
- **Значения cfg и пресета при обновлении переносятся.** В новый файл из репо вносятся значения старого рабочего файла по имени переменной (без учёта регистра). Новое поле приходит со значением из репо, метаданные (label, tooltip, секции, порядок) берутся из нового файла, исчезнувшая переменная отбрасывается.
  - Принято: новый default из репо не доходит до поля, которое пользователь не трогал. Без оригинала не отличить "поставил сам" от "было по умолчанию", старое значение побеждает.
  - Смена режима парсера (первая `@Bind` в пресете превращает остальные присваивания в скрытые константы) теряет перенос их значений: перенос идёт только по полям новой схемы.
- **Файл без записи в `.versions.json`** (скачан до фазы 3). `metas` сравнивает sha его содержимого с manifest: равны - запись создаётся (`versions.adopt`), нет - `hasUpdate` true. Файл с другим sha остаётся без записи и хешируется заново при каждом вызове `metas`, пока его не установят или не обновят: цена принята, окно - dev-сборки. Ошибка чтения при сравнении логируется, `hasUpdate` остаётся false: sync не должен затереть файл. Старый `.local-cache.json` не читается и не удаляется.
- **Битый `.versions.json`** читается как пустой, и следующая запись его пересоздаёт: все прежние записи потеряны, файлы с правками пользователя пройдут правило "без записи" и получат `hasUpdate` (sync их перезапишет). Принято: запись атомарна (`fsx.write`), файл бывает битым только от ручной правки.
- **Порядок записи.** Файлы пишутся первыми, версии - после и одним `record` в конце установки: сбой между ними оставляет старую запись, `hasUpdate` остаётся true, обновление повторится. Версия - sha скачанных байт репо (`fsx.sha(content)`), а не результат переноса значений. Сбой скачивания cfg валит установку скрипта: скрипт без cfg не загрузится, а версия не пишется, поэтому обновление не теряется.
- **Гонка `adopt` и установки.** `record` перезаписывает ключ, `adopt` пишет только отсутствующие: запоздалая миграция из устаревшего снимка `metas` не вернёт старый sha поверх свежей установки.
- **Bulk-sync не перекачивает актуальное.** `libs.sync` и `binds.sync` качают только не скачанное и с `hasUpdate`: иначе правки пользователя в актуальных файлах затирались бы без всякого обновления.
- **Сериализация.** Чтение-правка-запись одного файла (`save`, `install`) и записи `.versions.json` одного источника идут по очереди (`fsx.queue`): параллельные установки не теряют записи друг друга.
- **Чтение ничего не пишет**, кроме создания записи для файла без версии (см. выше). `isDownloaded` - рабочий файл существует.

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
  - существующий `ahk` (`app/utils/ahk.ts`) расширяется, новый namespace не заводится;
  - форма `ConfigSchema` повторяет `PresetSchema` (`shared/types/binds.ts:1-28`), но без типа `boolean` - в v1 его нет.
- **Depends on:** -

### Phase 2: Доставка v1 и запуск через AutoHotkey v1 [done]
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
  - Между Phase 2 и Phase 4 форма пресета не работает: `.ahk`-пресет уже в каталоге, а `binds/files.ts` ещё читает JSON (`fsx.json.read` -> `validation`). Скачивание и запуск работают. Окно - dev-сборки, отдельно не чиним.
  - cfg в этой фазе ставится как есть: версию он не несёт, а перенос значений при обновлении появится в Phase 5.
  - Диалог конфига скрипта (`scripts:config:*`) читает `cfg/<имя>.json` и до Phase 5 не работает: окно - dev-сборки, отдельно не чиним.
- **Reuse:**
  - `fileIn`, `sorted` (`app/catalog/derive.ts`);
  - `github.file`, `fsx.write`, `fsx.confine`;
  - `resolveSha` (`app/catalog/metas.ts:23`);
  - образец `reg.exe` - `app/fonts/registry.ts:45`;
  - `processes.run` (`app/scripts/processes.ts:81`) правится на месте.
- **Depends on:** Phase 1

### Phase 3: Версии скачанного в `.versions.json` [done]
- **What:**
  - `hasUpdate` скриптов, `support`, lib и пресетов считается по записи версии, а не по содержимому локального файла;
  - правка пользователя в скачанном файле обновление не вызывает;
  - кеш `.local-cache.json` (mtime / size / sha) уходит.
- **Where:**
  - `app/utils/paths.ts` (modify): `paths.source(id).cache` -> `versions` (`.versions.json`).
  - `app/utils/fsx.ts` (modify): `fsx.queue(key, task)` - задачи с одним ключом идут по очереди.
  - `app/catalog/versions.ts` (create), экспорт `catalog.versions` из `app/catalog/index.ts`:
    - `read(sourceId) -> Versions` - нет файла -> `{}`, битый -> warn и `{}`;
    - `record(sourceId, entries)` - слияние с перезаписью ключей и атомарная запись, очередь на источник;
    - `adopt(sourceId, entries)` - то же, но только отсутствующие ключи (миграция из `metas`).
  - `app/catalog/types.ts` (modify): `LocalCache*` удаляются, добавляется `Versions = Record<string, string>`.
  - `app/catalog/install.ts` (modify):
    - файл скрипта, cfg и `support` пишутся как сейчас, версии - одним `versions.record` с `fsx.sha(content)` в самом конце, после успеха всех трёх;
    - сбой скачивания cfg больше не глотается: установка падает (`errors.wrap`), версия скрипта не пишется;
    - файл cfg по-прежнему перезаписывается целиком, версия cfg не пишется; перенос значений - Phase 5;
    - `support` пропускается, если файл есть и запись равна sha из manifest; `localSha` удаляется.
  - `app/libs/files.ts` (modify):
    - `download` пишет версию каждого файла (`lib/<путь>`);
    - `syncSource` качает только не скачанные и с `hasUpdate` (как `binds.sync`), а не весь каталог; комментарий "Весь каталог источника" уходит.
  - `app/binds/files.ts` (modify): `download` пишет версию пресета (`presets/<файл>`); формат файла пока JSON, значения не трогаются.
  - `app/catalog/metas.ts` (modify):
    - из `resolveSha`, `readCache`, `sameCache` остаётся проверка существования файла: только `ENOENT` значит "не скачан", иная ошибка `stat` логируется (warn) и файл считается скачанным (иначе sync перекачает его поверх правок);
    - `hasUpdate` = запись != sha в manifest; `supportStale` - файла нет или запись != sha;
    - файл без записи - правило из шапки ("Файл без записи"), создание записей одним `versions.adopt`.
  - `shared/types/catalog.ts` (modify): `CatalogScript.localSha` удаляется, в renderer он не используется (проверить через `map.mjs`).
  - Тесты:
    - `tests/app/catalog/versions.test.ts` (create):
      - чтение и запись, нет файла, битый файл;
      - параллельные `record` двух источников и одного не теряют записи;
      - `adopt` не перезаписывает существующий ключ, в том числе при гонке с `record`;
      - `record` после битого файла пересоздаёт его;
    - `tests/app/catalog/{metas,install}.test.ts`:
      - правка скачанного скрипта не даёт `hasUpdate`;
      - смена sha в manifest даёт;
      - сбой между записью файла и версией оставляет `hasUpdate` true;
      - сбой скачивания cfg валит установку и версия скрипта не пишется;
      - файл без записи: sha равен - запись создана, не равен - `hasUpdate` true, ошибка чтения - false;
      - ошибка `stat` не `ENOENT` не превращается в "не скачан";
      - `support`: нет файла или другая версия - `hasUpdate` у скриптов;
    - `tests/app/libs/files.test.ts`: версия пишется после загрузки; `sync` не перекачивает актуальный файл с правкой пользователя;
    - `tests/app/binds/files.test.ts`: версия пишется после загрузки;
    - `tests/app/utils/{fsx,paths}.test.ts`.
- **How:**
  - Версию пишет тот, кто скачал: `install` каталога, `libs`, `binds`. Один namespace `catalog.versions`, без своих копий в концернах.
  - Порядок `install`: cfg и `support`, затем скрипт, версии одним `record`. Скрипт последним: при сбое cfg он не остаётся на диске без записи, иначе `metas` принял бы его через `adopt` за актуальный.
  - Удаление записей не нужно: файла нет -> не скачан, запись безвредна, следующая установка её перепишет.
  - `fsx.queue` нужен и Phase 4: `catalog.config` ставит и правит один файл по очереди.
- **Reuse:**
  - `fsx.write`, `fsx.sha`, `fsx.json`, `fsx.confine`;
  - логика пропуска `support` из `install.ts` и `localSha` переезжает в `versions`, второй копии не заводим;
  - механизма версий в коде нет (искал в `app/catalog`, `app/libs`, `app/binds`): `.local-cache.json` хранит sha содержимого, не версию из репо.
- **Depends on:** Phase 2

### Phase 4: Значения пресетов в .ahk, `catalog.config` [done]
- **What:**
  - правка пресета пишет значение прямо в `presets/<файл>.ahk`;
  - обновление пресета переносит значения пользователя в новый файл;
  - пресеты переходят на `ahk.parse`; JSON-разбор пресетов, `*.values.json` и Reset удаляются.
- **Where:**
  - `shared/types/config.ts` (modify): `ConfigField.default` -> `value` (текущее значение в файле).
  - `app/utils/ahk.ts` (modify): `field()` пишет `value`; новый `ahk.merge(text, previous) -> string` - значения полей `previous` вносятся в `text` по имени, неизвестные пропускаются.
  - `app/catalog/config.ts` (create), экспорт `catalog.config`. `ref` = `{ sourceId, path }`, путь от корня источника (`presets/<файл>`), `fsx.confine` к `paths.source(id).base`:
    - `read(ref) -> ConfigSchema | null` - нет файла -> `null`; только `ENOENT` значит "нет файла", иное - `errors.wrap(e, ..., 'failed')`;
    - `save(ref, values)` - `ahk.patch(файл, values)`; нет файла -> `not_found`; значения незнакомых полей игнорируются;
    - `install(ref, content)` - файла нет -> content как есть, есть -> `ahk.merge(content, старый)`;
    - `save` и `install` идут по очереди на путь (`fsx.queue`).
  - `app/binds/files.ts` (modify):
    - схема и `values.save` - через `catalog.config`;
    - `download` - `catalog.config.install`, затем `catalog.versions.record`;
    - `remove` удаляет рабочий файл; старый `*.values.json` не трогается;
    - `values.get` и `values.reset` удаляются.
  - `app/binds/preset.ts` (delete).
  - `app/binds/handlers.ts`, `shared/types/ipc-channels.ts` (modify):
    - каналы `binds:values:get` и `binds:values:reset` удаляются;
    - `binds:schema:get` -> `ConfigSchema | null`, значения - в `field.value`;
    - `binds:values:save` -> `ConfigValues`.
  - `shared/types/binds.ts`, `shared/types/index.ts` (modify): `Preset*` удаляются, вместо них `Config*`.
  - `shared/schema.ts` (modify):
    - `isPresetKey` -> проверка идентификатора AHK; `__proto__` и др. отвергаются;
    - `schema.preset.values` -> `schema.config.values`: значение - конечное число или строка без `\r\n`, `boolean` нет;
    - `schema.config.path` остаётся до Phase 5.
  - renderer (`src/entities/bind/form/**`, UI - через `/shadcn`):
    - ветка `field.type === 'boolean'` и `Switch` (`PresetFieldRow.tsx:39`) удаляются: без `boolean` в `ConfigFieldType` это TS2367;
    - ключ поля - имя переменной вместо `<секция>.<поле>`; у секции нет `name`: ключ по индексу, пустой `title` - без заголовка;
    - кнопка Reset и ключ `binds.reset` в i18n удаляются;
    - `presetValues.defaults` и `strip` удаляются: форма показывает `field.value`, правки копятся в `edits`, на Save уходят они; после Save запрос `binds:schema:get` обновляется (`await invalidate`), и только затем `edits` сбрасываются: форма не мигает старыми `field.value`, сбой refetch оставляет правки на экране;
    - `binds:values:get` убирается из `src/lib/hooks/useQuerySync.ts`, `src/entities/bind/grid/useBindActions.ts`, `src/entities/source/manage/useSources.ts`.
  - Тесты:
    - `tests/app/utils/ahk.test.ts`: `value` вместо `default`, `ahk.merge`:
      - новое поле приходит с значением репо;
      - значение старого файла побеждает;
      - исчезнувшая переменная отбрасывается;
      - метаданные берутся из нового файла;
      - BOM и EOL нового файла сохраняются;
    - `tests/app/catalog/config.test.ts` (create):
      - `read`: нет файла -> `null`, прочая ошибка -> `failed`;
      - `save`: ручные правки вне полей, скрытые константы, BOM и EOL переживают; нет файла -> `not_found`;
      - `install`: нет файла - как есть, есть - перенос значений;
      - параллельные `save` и `install` одного пути не теряют правку;
      - сбой записи оставляет старый файл целым;
    - `tests/app/binds/{files,handlers}.test.ts`;
    - `tests/app/binds/preset.test.ts` (delete);
    - `tests/src/entities/bind/form/preset-values.test.ts`, `tests/src/lib/hooks/useQuerySync.test.ts`;
    - `tests/shared/schema.test.ts`.
- **How:**
  - `catalog.config` живёт в `catalog`: это предок `binds` и `scripts` в `modules`, граф идёт только вниз.
  - `ahk.merge` = `ahk.patch(новый, значения полей parse(старый))`: логика переноса одна, у `catalog.config` и у `ahk` нет второй копии. Исключение: поля `:=` с выражением без кавычек (`false`, `A_ScreenWidth`) не переносятся, остаётся значение нового файла: `patch` записал бы их строкой и сломал смысл.
  - Версию пресета пишет вызывающий (`binds`), после `config.install`: `config` версий не знает.
- **Reuse:**
  - `ahk.parse`, `ahk.patch`;
  - `fsx.write` (атомарная запись), `fsx.confine`, `fsx.queue`, `catalog.versions.record` из Phase 3;
  - канал `binds:values:save` остаётся, меняются типы.
  - Механизма "читать .ahk, править значение, переносить при обновлении" в коде нет (искал в `app/catalog`, `app/binds`, `app/utils`): нужен он двум концернам.
- **Depends on:** Phase 1, Phase 2, Phase 3

### Phase 5: Конфиг скрипта на `cfg_<файл>.ahk` и общая форма `kit/config-form` [done]
- **What:**
  - диалог конфига скрипта показывает секции `@Title`, подсказки и бинды, значения сохраняет в `cfg_<файл>.ahk`;
  - при обновлении скрипта значения cfg переносятся;
  - форма пресета и форма конфига - один модуль kit;
  - остатки v2 удаляются.
- **Where:**
  - main:
    - `app/scripts/index.ts` (modify): `Script.config` из `catalog.config.read({ sourceId, path: 'scripts/cfg/cfg_<файл>' })`, без `configPath`;
    - `app/scripts/handlers.ts` (modify): `scripts:config:get/save` по `id` (`schema.script.id`), Reset нет;
    - `app/catalog/install.ts` (modify): cfg ставится через `catalog.config.install` (перенос значений), версия cfg не пишется; сбой cfg по-прежнему валит установку (Phase 3);
    - `app/catalog/metas.ts` (modify): cfg скрипта есть в manifest, рабочего файла нет -> `hasUpdate` true (скрипт без cfg не загрузится); состав cfg на `hasUpdate` больше не влияет.
  - shared:
    - `shared/types/scripts.ts` (modify): удаляются `HkEntry`, `ValEntry`, `ScriptCfgFile`, `ScriptCfgValues`;
    - `shared/schema.ts` (modify): удаляются `schema.config.path` и `schema.script.values`;
    - `shared/types/ipc-channels.ts` (modify): `scripts:config:get/save` по `id`.
  - renderer:
    - `src/kit/config-form/` (create): `index.ts`, `ConfigForm.tsx`, `ConfigFieldRow.tsx`, `config-values.ts`; данные и `save` - пропсами;
    - `src/entities/bind/form/*` (modify): на kit, `PresetFieldRow.tsx` и `preset-values.ts` уходят в kit;
    - `src/entities/script/values/*` (modify): вкладки Hotkeys/Values -> секции, `config-values.ts` удаляется;
    - `src/entities/script/list/ScriptRow.tsx` (modify);
    - i18n (modify).
  - Тесты:
    - `tests/src/kit/config-form/config-values.test.ts` (move из `bind/form/preset-values`);
    - `tests/src/entities/script/values/config-values.test.ts` (delete);
    - `tests/app/catalog/{install,metas}.test.ts`, `tests/app/scripts/{handlers,index}.test.ts`.
- **How:**
  - UI - через `/shadcn`, модуль kit - по `docs/standard.md`.
  - Образец формы - `src/entities/bind/form/PresetForm.tsx`.
  - Внутри kit файлы не импортируют свой `index.ts`.
  - После правок - `graph.mjs cycles`.
- **Reuse:**
  - в kit переезжают `PresetFieldRow` и `presetValues.equal` (`src/entities/bind/form/preset-values.ts`);
  - `KeyBindInput` (`src/ui/KeyBindInput.tsx:20`), `toast.result`, `useInvalidate`;
  - `catalog.config` из Phase 4;
  - образец модуля kit - `src/kit/catalog-actions/`.
- **Depends on:** Phase 4

### Phase 6: Документация и выпуск
- **What:** доки соответствуют v1, лог версии записан.
- **Where:**
  - `docs/app.md`, `docs/architecture.md` (modify):
    - `.versions.json` вместо `.local-cache.json` (`architecture.md:141`) и `localSha` (`app.md:211`, `app.md:393`);
    - каналы `binds:values:get` и `binds:values:reset` (`app.md:312-313`, `app.md:458-461`, `architecture.md:185`, `architecture.md:187`), Reset и `<имя>.values.json` (`app.md:303`, `app.md:534`), `PresetSchema` / `PresetValues` (`app.md:406`);
    - конфиг скрипта (`app.md:147`): `scripts:config:*` по `id`, значения в `cfg_<файл>.ahk`;
  - `docs/versions/*` - через `/notes`.
- **How:**
  - `/sync-docs`.
  - В `/notes` отметить:
    - значения v2 сброшены: ключи не совпадают;
    - удалённые из репо v2-скрипты (`delay`, `endo_nidus`) пользователь убирает сам;
    - старые `*.values.json` и `.local-cache.json` в `global_vault` не трогаются;
    - обновление перезаписывает скрипты, lib и пресеты целиком: ручные правки теряются, значения cfg и пресетов переносятся по имени переменной;
    - новый default из репо не доходит до поля, которое пользователь не трогал;
    - правка скачанных файлов обновление не вызывает;
    - Reset в формах нет.
- **Reuse:** `.claude/scripts/doc-refs.mjs` через `/sync-docs`.
- **Depends on:** Phase 5

## Before merge

`/ship` - typecheck + lint + test + скан ветки + циклы импортов + build. Ревью в нём нет - это `/isgood` каждой фазы.
