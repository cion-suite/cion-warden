Completion steps (после каждой фазы)

1. pnpm typecheck (затронуты и src/, и app/).
2. pnpm lint
3. pnpm test
4. /isgood - adversarial review + fix-loop.
5. /notes - лог версии и commit-сообщение (uncommitted mode).
6. Отметить фазу [done] в docs/planned-now.md.
7. STOP & WAIT - подтверждение перед следующей фазой.

---

## Warden: бинд мыши, поиск без палитры, табы конфига, только release, двойные релизы

Слои: renderer (`src/ui`, `src/shell`, `src/kit/config-form`), main (`app/updater`), shared (`shared/config.ts`, `shared/settings.ts`), CI (`.github/workflows/release.yml`), `scripts/`, `.claude/scripts/notes.mjs`, документация.

Допущения: версия с суффиксом (`-beta.N`) больше не выпускается - `/notes` на ней отказ, лог в приложении только `release.md`. Бинд-поля `@Bind` = поля типа `hotkey`. `MOD_KEY` после удаления палитры нужен только `Navbar` - становится локальной константой там.

### Phase 1: KeyBindInput - нажатие мыши всегда бинд [done]
- **What:** пока поле в записи и курсор в окне, любая кнопка мыши (L/M/R/XButton1/XButton2) и любая клавиша - бинд; ПКМ не открывает контекстное меню, XButton не уводит маршрут назад.
- **Where:** `src/ui/KeyBindInput.tsx` (modify).
- **How:** после `commit()` на `pointerdown` перехват не снимается вместе с эффектом: "хвостовой" перехватчик на `window` (capture) глушит `pointerup`, `mouseup`, `click`, `auxclick`, `contextmenu` (`preventDefault` + `stopPropagation`). Снимается НЕ на `pointerup`: на Windows `contextmenu` и `auxclick` приходят после него, а `click` ЛКМ уходит элементу под курсором даже при погашенном `pointerdown`. Снятие - короткий таймаут после `pointerup` нажатой кнопки, плюс страховка: `blur` окна, unmount компонента (ref + cleanup эффекта), новый `pointerdown`. Причина бага: `commit` -> `setListening(false)` + `blur()` снимает слушатели эффекта до отпускания.
- **Ограничение (вне scope):** аккорд кнопок - нажатие второй кнопки при зажатой первой даёт `pointermove`, не `pointerdown`; биндится только одиночное нажатие.
- **Не трогать:** перехват в main уже есть - `win.on('app-command')` гасит `browser-backward/forward` (`app/shell/index.ts:69-71`); навигацию XButton в Blink гасит `preventDefault` на `pointerup` (`KeyBindInput.tsx:51-56`).
- **Reuse:** `keyBind.button` / `keyBind.key` - `src/ui/key-bind.ts`; существующие capture-слушатели `KeyBindInput.tsx:35-72` (расширяются, не заменяются). Тест: окружение vitest - node без DOM, `tests/src/ui/key-bind.test.ts` уже покрывает чистую функцию; проверка - вручную в `pnpm dev` (L/M/R/X1/X2 поверх кнопки диалога и поверх самого поля; отпускание вне окна).
- **Depends on:** -

### Phase 2: убрать палитру команд и лупу, лупа - декорация поля поиска
- **What:** удалить `src/shell/command/` целиком (палитра, Ctrl+K) и кнопку-лупу в шапке; в поле поиска страниц - иконка `SearchIcon` слева как декорация.
- **Where:** `src/shell/command/*` (delete); `src/shell/layout/Layout.tsx` (modify - убрать `useCommandPalette`, `CommandPalette`, проп `onSearch`); `src/shell/navbar/Navbar.tsx` (modify - убрать кнопку и проп `onSearch`, `MOD_KEY` локально); `src/ui/useNavbarSearch.tsx` (modify); `src/lib/i18n/locales/{en,ru}.ts` (modify - удалить `shell.palette.*`, `shell.navbar.search`); `docs/app.md`, `docs/architecture.md`, CLAUDE.md раздел 3 (`command` в списке оболочки) (modify).
- **How:** сначала `/shadcn`. Поле: `InputGroup` + `InputGroupAddon` с `SearchIcon` + `InputGroupInput` (образец: `src/entities/source/manage/SourceFormFields.tsx:68-92`). После удаления - `node .claude/scripts/graph.mjs cycles` и Grep по `@/shell/command`. Осиротевшие `src/ui/shadcn/command.tsx` и зависимость `cmdk` (`package.json:57`) - удалить, если Grep не найдёт других потребителей (сейчас их нет).
- **Reuse:** `src/ui/shadcn/input-group.tsx` (уже добавлен); `useSetNavbarSlot` - `src/lib/navbar`. Нового кода нет - только удаление.
- **Depends on:** -

### Phase 3: табы "Значения" / "Бинды" в форме конфига
- **What:** `ConfigForm` показывает два таба (`Tabs`): "Значения" - поля не-`hotkey`, "Бинды" - поля `hotkey`; внутри таба заголовки `@Title` остаются подзаголовками. Одна группа пуста - табов нет, форма как сейчас. Действует и в диалоге макроса, и в форме пресета.
- **Where:** `src/kit/config-form/ConfigForm.tsx` (modify); `src/kit/config-form/config-values.ts` (modify - член `split`); `tests/src/kit/config-form/config-values.test.ts` (modify); `src/lib/i18n/locales/{en,ru}.ts` (modify - ключи табов).
- **How:** сначала `/shadcn`. `configValues.split(schema)` -> `{ values: ConfigSection[], binds: ConfigSection[] }`: секции фильтруются по `field.type === 'hotkey'`, пустые выпадают. Рендер секции - локальная функция в `ConfigForm.tsx`. `PresetForm` и `ScriptConfigDialog` не меняются.
- **Reuse:** namespace `configValues` - `src/kit/config-form/config-values.ts` (утилита липнет к нему, без нового файла); `src/ui/shadcn/tabs.tsx` (уже добавлен, в `src/` не используется); `ConfigFieldRow` без изменений.
- **Depends on:** -

### Phase 4: убрать beta-канал
- **What:** из приложения, сборки, логов и документации убрано всё про beta; канал один - latest, лог - `release.md`.
- **Where:** `shared/settings.ts` (`updaterBeta` - удалить); `shared/config.ts` (`feeds.betaUrl` - удалить); `app/updater/updater.ts` (`BETA_FEED`, `currentFeed`, `settings.on('updaterBeta')`, `allowDowngrade`, beta-ветка `updater:changelog:get`); `src/shell/settings/UpdatesCard.tsx` (переключатель канала); `src/shell/update/changelog-filter.ts` (beta-предикат, строка 48) и его вызовы в `ChangelogPage.tsx` / `usePostUpdateChangelog.ts`; `electron-builder.beta.json` (delete); `package.json` (`dist:beta`); `docs/versions/beta.md` (delete); `scripts/check-placeholders.mjs` (beta-пара); `scripts/release-notes.mjs` (beta-кейс); `.claude/scripts/notes.mjs` (`channelFile` -> всегда `release.md`, суффикс - отказ; самопроверка 383-427); `.claude/commands/notes.md`, `.claude/commands/ship.md:30` (`dist:beta`), `.claude/agents/expert-electron.md`; i18n `{en,ru}.ts`; тесты `tests/app/updater/updater.test.ts` (155-183, 362-369, 401-408), `tests/shared/settings.test.ts`, `tests/shared/config.test.ts`, `tests/src/shell/update/changelog-filter.test.ts`, `tests/scripts/release-notes.test.ts`; CLAUDE.md разделы 2, 4, 5, 9; `docs/architecture.md`, `docs/app.md:376`, `README.md:58`.
- **How:** удаление без новой логики. Regex заголовка версии в трёх местах (`notes.mjs`, `release-notes.mjs`, `changelog-filter.ts`) не трогается - beta-специфичен только выбор файла/канала. Старый ключ `updaterBeta` в сторе settings ядро отрезает `schema.safeParse` при загрузке (`cion-suite/packages/core/src/settings/index.ts:90-99`) - миграция не нужна.
- **Reuse:** только удаление; новых символов нет.
- **Depends on:** -

### Phase 5: двойные GitHub Release и обновлятор по двум репозиториям
- **What:** CI на зелёный push в `main` собирает установщик на windows-runner и создаёт одинаковые Release `vX.Y.Z` с ассетами (exe, blockmap, `latest.yml`) и текстом из `release.md` в `cion-suite/cion-warden` и `Lazy-World/wf-macro`. Обновлятор проверяет оба: wf-macro без токена, cion-warden - с PAT источника владельца `cion-suite` из vault, если есть; берётся самая новая версия.
- **Where:** `shared/config.ts` (modify: `feeds` -> `CONFIG.releases: [{ owner: 'Lazy-World', repo: 'wf-macro' }, { owner: 'cion-suite', repo: 'cion-warden', private: true }]`); `electron-builder.json` (modify: `publish` -> два `github`-провайдера тем же owner/repo; `artifactName` без пробела - иначе GitHub переименует ассет и он разойдётся с `latest.yml`); `package.json` (`dist` -> `--publish never`); `scripts/check-placeholders.mjs` (инвариант `CONFIG.releases` == `publish[]`); `app/github/index.ts` (modify: новый член namespace `github` - релизы репозитория по `GithubRepoRef` + необязательный токен; `api` / `slug` / `bearer` сейчас приватны модулю, `parse` принимает `SourceRecord` - не переиспользуются снаружи напрямую); `app/updater/updater.ts` (modify); `app/updater/module.ts` (modify: `needs: [sourcesModule, githubModule]` - оба выше updater, граф вниз соблюдён); `.github/workflows/release.yml` (modify); `tests/app/updater/updater.test.ts`, `tests/app/github/*` (тест нового члена), `tests/shared/config.test.ts` (modify); CLAUDE.md разделы 5, 9, `docs/architecture.md` (modify).
- **How:**
  - **Только warden.** В обоих репозиториях релизы будут только warden (решение пользователя), "Latest" репозитория - последний релиз warden. Старый `0.1.0` в wf-macro (тег без `v`, без `latest.yml`) уйдёт из "Latest" с первым релизом warden; до того его отсекает фильтр ниже.
  - **Выбор:** версия "Latest" каждого репозитория: wf-macro - без API, редиректом `https://github.com/<owner>/<repo>/releases/latest` -> `.../tag/<тег>` (как сам `GitHubProvider`, `GitHubProvider.js:21-24`: анонимный API делит лимит 60/ч с деревьями источников); cion-warden - `GET /repos/<owner>/<repo>/releases/latest` с токеном (новый член `github`). Тег через `semver.valid` (невалидный - репозиторий пропускается) -> максимум по semver; при равных - wf-macro. Победитель не больше `app.getVersion()` (старые `0.1.0` / `0.1.1` в wf-macro до первого релиза warden) -> `updater:checked` без `checkForUpdates`. Победитель -> `autoUpdater.setFeedURL({ provider: 'github', owner, repo })` для wf-macro или `{ provider: 'github', owner, repo, private: true, token }` для cion-warden -> `checkForUpdates()`. Скачивание и установка - electron-updater (оба провайдера сами берут `releases/latest`, `GitHubProvider.js:163`).
  - **Токен:** `store.list()` -> источники, у которых owner совпадает с `cion-suite` без учёта регистра -> по очереди `tokens.get(id)`, первый, с которым запрос релиза cion-warden прошёл (у fine-grained PAT может не быть доступа). Токен не попадает в лог: `log.info` пишет только owner/repo/версию, не объект `setFeedURL`.
  - **Сбой одного репо на выборе** (404 без доступа, rate limit, сеть) - логируется, выбор идёт по второму; оба упали - `updater:failed`. Сбой `checkForUpdates` у победителя (нет `latest.yml` и т.п.) - `updater:failed` через `autoUpdater.on('error')`, отката на второй репо нет (осознанно: KISS).
  - **Одна проверка за раз:** плановая и ручная проверка делят один in-flight промис (выбор + `setFeedURL` + `checkForUpdates`), иначе второй `setFeedURL` подменит провайдер посреди идущей проверки (`AppUpdater.js:257-261`). `allowDowngrade` не выставляется (дефолт false, `AppUpdater.js:138`).
  - **Ограничение:** при `private: true` `GH_TOKEN` / `GITHUB_TOKEN` из env важнее `options.token` (`providerFactory.js:24`) - на машине с такой переменной приватный репо пойдёт с её токеном. Принято, фиксируется в `docs/architecture.md`.
  - **CI:** job `notes` (ubuntu: версия, проверка тега в каждом репо отдельно, извлечение текста) -> job `build` (windows-latest: checkout с `path: cion-warden` и `.github/actions/setup` с секретом `CION_SUITE_PAT` как в `ci.yml:83-89`; затем `pnpm dist` = `check:placeholders` + `electron-vite build` + `electron-builder --publish never`; exe/blockmap/`latest.yml` -> `actions/upload-artifact`) -> job `publish` (`actions/download-artifact`): `gh release create --target "$HEAD_SHA"` в своём репо с `GITHUB_TOKEN`; `gh release create -R Lazy-World/wf-macro` с секретом `WF_MACRO_TOKEN` БЕЗ `--target` (коммита warden там нет -> 422), тег встаёт на HEAD ветки по умолчанию wf-macro; тег уже есть в репо - пропуск только для него.
- **Reuse:** `api.send` / `slug` / `bearer` - `app/github/index.ts:21-45` (внутри нового члена `github`); `tokens.get` - `app/sources/tokens.ts:27`; `store.list` - `app/sources/store.ts:38`; `GithubRepoRef` - `shared/repo.ts`; `semver` - прямая зависимость (`package.json:83`, уже в `src/shell/update/changelog-filter.ts:1`); шаги setup - `.github/actions/setup/action.yml`; извлечение текста - `scripts/release-notes.mjs`. Новое - только член `github` (последний релиз) и выбор между двумя репо в updater: аналога нет (`map.mjs`: releases не объявлено).
- **Depends on:** Phase 4 (beta-фид и `feeds` удалены, `CONFIG` переписывается один раз).

## Before merge

`/ship` - typecheck + lint + test + скан ветки + циклы импортов + build. Ревью в нём нет - это `/isgood` каждой фазы.

Лог `v1.0.0`: раздел в `docs/versions/release.md` уже есть, тега нет, а буллеты про палитру команд, выбор канала beta и "вкладок больше нет" после фаз 2-4 станут ложью. После последней фазы - `/notes <корневой коммит>..HEAD --replace` (перезапись - только с явного согласия пользователя).

Нужно от пользователя до Phase 5: секрет `WF_MACRO_TOKEN` (fine-grained PAT, `contents: write` на `Lazy-World/wf-macro`) в cion-warden; Settings -> Actions -> Workflow permissions -> Read and write.
