# Feature: Private Git sources via PAT

GitHub Personal Access Token для private-репозиториев. Token хранится в `createSecureStorage`, в UI отображается маскированным (`github_pat_1***U`), нельзя скопировать, можно заменить через pencil-кнопку.

## UX контракт (renderer)

В `GitFormFields`, под Branch / Private switch:

- Switch `Private` = `false` → PAT-поля нет.
- Switch `Private` = `true`:
  - Если для источника **уже сохранён** токен (`hasToken === true` и source существует):
    - Поле PAT отрендерено в **locked**-режиме — `disabled`, `value` = маска (`github_pat_1***U`), `userSelect: none`, `onCopy/onCut/onContextMenu` → `preventDefault`. Pencil-кнопка справа (`InputGroupAddon`).
    - Клик по pencil → поле становится `enabled`, value очищается (`''`), `type="password"`, фокус. Pencil исчезает, появляется Cancel-icon (опц. — возврат в locked без save).
  - Если токена ещё нет (новый источник, или `isPrivate` только что включён):
    - Поле сразу editable, type="password", placeholder `github_pat_...`.
- На Save: если буфер токена непустой и не равен маске → IPC `sources:set-token`. Если `isPrivate` выключен → IPC `sources:remove-token`. Сам PAT не пишется в `sources.json`.

## Mask-формат

`maskToken(raw)`:
- `github_pat_<22>_<59>` или `ghp_<...>` или прочее.
- prefix до первого `_` после `github_pat`/`ghp` + первый char секрета + `***` + последний char.
- Пример: `github_pat_11ABCDEFGUSER` → `github_pat_1***R`.
- Fallback: `***` если длина < 8.

## Completion steps (после каждой фазы)

1. `pnpm typecheck`
2. `pnpm lint`
3. `/isgood` — adversarial review + fix-loop
4. `/notes` — changelog UNCOMMITTED
5. Отметить фазу как `[done]` тут
6. **STOP & WAIT** — confirmation перед следующей

---

## Phase 1: Secure-store wrapper + types [done]

- **What:** Wrapper `source-tokens` поверх `createSecureStorage`. Расширение `GitVaultSource` флагом `hasToken` (**computed-only — НЕ сериализуется в `sources.json`**). Mask-утилита.
- **Where:**
  - modify `shared/types/vault.ts` — `GitVaultSource.hasToken?: boolean` с JSDoc-комментом «computed at listSources; never persisted».
  - create `app/services/source-tokens.ts` — экспортирует `createSourceTokens({ storage, logger })` → `{ setToken, getToken, removeToken, hasToken, getTokenMask }`. Key namespace: `source:token:<sourceId>`. **`import type { SecureStorage } from '@cion-suite/core/storage'` + `import type { Logger } from '@cion-suite/core/log'`** (verbatimModuleSyntax).
  - create `app/utils/mask-pat.ts` — `maskToken(raw: string): string` чистая функция.
  - modify `app/services/boot.ts` — пробросить `storage` + `logger` в `createSourceTokens(...)`, добавить в `AppServices`.
  - modify `app/types/services.ts` — `AppServices.sourceTokens: SourceTokens`.
- **How:** Фабрика `createSourceTokens` (не singleton) принимает зависимости в конструкторе — DI-style, как `boot.ts` инициализирует storage/settings. `removeToken` swallows «not-found» (best-effort), любую другую ошибку — `logger.error('source-tokens.remove', err)`, не throw. `setToken` валидирует `token.trim().length > 0` иначе throw. `hasToken(id)` читает раз — если ошибка чтения secure-store (повреждён ключ, EACCES) → `logger.error(...)` + return `false` (graceful: UI покажет editable поле, save сможет перезаписать).
- **Reuse:** `createSecureStorage` из `@cion-suite/core/storage` (`app/services/boot.ts:22`). `Logger` из `@cion-suite/core/log` (`app/services/boot.ts:19`).
- **Depends on:** —

---

## Phase 2: IPC + handlers + preload-bridge [done]

- **What:** Новые IPC методы: `sources:set-token`, `sources:remove-token`, `sources:test-token`, `sources:get-token-mask`. `sources:list` дополняет git-источники `hasToken`. **`sources:remove` + `sources:update` — server-side очистка токена** (single source of truth, без race из renderer).
- **Where:**
  - modify `shared/types/ipc.ts` — `AppBridge.sources`: добавить `setToken(id, token)`, `removeToken(id)`, `testToken(id)`, `getTokenMask(id)`. Типы возвратов: `setToken: Promise<void>`, `getTokenMask: Promise<string | null>`, `testToken: Promise<{ ok: true } | { ok: false; status: number; message: string }>`.
  - modify `app/handlers/sources.ts`:
    - сигнатура → `registerSourceHandlers(services: AppServices)`.
    - **все новые каналы валидируют args через `requireString` из `get-scripts.ts:241`** (вынести `requireString` в `app/utils/validate-ipc.ts` для cross-handler reuse — DRY).
    - заменить `String(rawId)` (`sources.ts:13,16`) на `requireString(rawId, 'id')` — текущая логика `String(null)` → `'null'` тихо проходит, gap по §4.
    - `sources:remove` → вызвать `removeSource(id)` затем `services.sourceTokens.removeToken(id)` (best-effort).
    - `sources:update` → если `patch.isPrivate === false` → также `removeToken(id)` server-side после writeFile.
  - modify `app/preload.ts` — exposed bridge: добавить 4 метода.
  - modify `app/main.ts:54` — передать `services` в `registerSourceHandlers(services)` (там же где `registerSystemHandlers(services)`).
  - modify `app/services/sources-store.ts`:
    - `listSources()` принимает `tokens: SourceTokens` (через handler-уровень) и обогащает git-источники: `await Promise.all(sources.map(s => s.type === 'git' ? { ...s, hasToken: await tokens.hasToken(s.id) } : s))`.
    - `catch` блоки (`sources-store.ts:14`) — заменить silent `return []` на `logger.error(...)` + `return []` (graceful, но виден в логах).
  - create `app/utils/validate-ipc.ts` — вынести `requireString`, чтобы все handlers могли импортировать (DRY-rescue по §4).
- **How:**
  - `sources:test-token` — `GET https://api.github.com/repos/{owner}/{repo}` с `Authorization: Bearer <pat>`, header `Accept: application/vnd.github+json`. Fine-grained PAT с `Contents: Read-only` всегда имеет `Metadata: Read-only` → endpoint работает. Возврат структурный (не throw) — UI мапит в toast.
  - **`sources:set-token` — validation: `requireString` + `token.trim().length > 0`**, иначе throw `'Invalid token'`. Пустой PAT в secure-store запрещён.
  - `sources:get-token-mask` — null если нет токена; маска через `maskToken(raw)`.
- **Reuse:** `registerHandlers` из `@cion-suite/core/ipc` (`app/handlers/sources.ts:1`). `parseGithubUrl` (`app/utils/github-url.ts:6`). `source-tokens` из Phase 1. `Logger` из `services.logger`.
- **Depends on:** Phase 1

---

## Phase 3: Authenticated fetch в get-scripts [done]

- **What:** `syncGitSource` и `downloadFromGitSource` тянут токен из secure-store, добавляют `Authorization: Bearer <pat>` header. Private-репо download через GitHub Contents API. Логи через `Logger` (не `console.warn`). Различение 403 auth vs 403 rate-limit.
- **Where:**
  - modify `app/handlers/get-scripts.ts`:
    - принять `services: AppServices` в `registerGetScriptHandlers(services, globalVaultPath)` (gap по §7 logger).
    - helper `buildGitHeaders(source, tokens)` асинхронно собирает headers (`User-Agent` + опц. `Authorization`).
    - в `downloadFromGitSource`: `if (source.isPrivate)` → URL `https://api.github.com/repos/{owner}/{repo}/contents/scripts/{file}?ref={branch}`, header `Accept: application/vnd.github.raw`. Public — current raw URL.
    - `syncGitSource`: статус-маппинг — `if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0')` → rate-limit; иначе 401/403 → throw `Error('sources.tokenInvalid')`; 404 при `isPrivate` → throw `Error('sources.tokenNoAccess')`.
    - `get-scripts:list` (Promise.allSettled `console.warn` на `get-scripts.ts:292`) → заменить на `services.logger.warn('[get-scripts:list] source failed', { sourceId, error })` (gap §7 silent failure).
    - **вынести литерал `'scripts'`** в const `SCRIPTS_DIR = 'scripts'` в начале файла — используется в 4+ местах (`get-scripts.ts:166,214,220,227`); DRY по Clean Code.
  - modify `app/main.ts` — передать `services` в `registerGetScriptHandlers(services, ...)`.
- **How:** Single `if (source.isPrivate)` ветка. Manifest формат не меняется. Cfg-fallback (`get-scripts.ts:225-236`) тоже проходит через `buildGitHeaders` и Contents API при private. Error mapping — error-message contains i18n-key, renderer-handlers ловят и мапят в `toast.error(t(err.message))` с fallback на `t('error')`.
- **Reuse:** `source-tokens.getToken` (Phase 1), `parseGithubUrl` (`app/utils/github-url.ts:6`), `services.logger` (Phase 1).
- **Depends on:** Phase 1

---

## Phase 4: UI — PAT field в SourcesDialog (skill `/shadcn`) [done]

- **What:** В `GitFormFields` (новый-source + settings-existing) добавить условный PAT-блок. Поведение по UX-контракту выше.
- **Where:**
  - **CLI:** `pnpm dlx shadcn@latest add input-group` (компонент ещё не установлен; список — `badge button card context-menu dialog dropdown-menu empty field input label popover scroll-area separator sheet skeleton sonner switch tabs toggle-group toggle tooltip`).
  - modify `src/features/sources-manage/ui/SourcesDialog.tsx`:
    - `GitFormFields` принимает доп. props: `sourceId?: string`, `hasToken: boolean`, `token: string`, `onTokenChange`, `tokenLocked: boolean`, `onUnlock: () => void`, `mask: string | null`.
    - Conditional `{isPrivate && <Field>…</Field>}`. Внутри — `InputGroup` + `InputGroupInput` (type=password / disabled when locked, `value={tokenLocked ? mask ?? '' : token}`) + `InputGroupAddon align="inline-end"` с `Button variant="ghost" size="icon-sm" aria-label={t('sources.tokenChange')}` иконка `Pencil` (locked). При unlocked — без addon-кнопки (replace происходит просто вводом нового значения).
    - **Locked input — `disabled` атрибута достаточно** для блокировки copy в Chromium (disabled `<input>` не позволяет select/copy через UI). НЕ добавлять `userSelect: none` / `onCopy preventDefault` — KISS-нарушение, защита cosmetic (DevTools всё равно видит mask, а raw PAT в DOM не попадает).
    - **`aria-label={t('sources.tokenChange')}`** на pencil-button (не только tooltip — для screen-reader).
    - `GitSettings`/`NewSourcePanel` локальный state: `token: string = ''`, `tokenLocked: boolean = source?.hasToken ?? false`, `mask: string | null = null`.
    - `useEffect(() => { if (source?.hasToken) void window.app?.sources.getTokenMask(source.id).then(setMask); else setMask(null); }, [source?.id, source?.hasToken])` — **deps включают `hasToken`** иначе после save mask не обновляется (component key={source.id} стабильный по `SourcesDialog.tsx:539`).
    - `handleSave`:
      ```
      await sources.update(id, patch);  // patch.isPrivate=false → server-side remove token
      if (isPrivateNow && token.trim().length > 0 && !tokenLocked) {
        await sources.setToken(id, token.trim());
      }
      ```
      **Token save guard: `token.trim().length > 0`** — иначе `'' !== mask` triggered empty token write. `tokenLocked` гарантирует что мы не пишем неизменённое значение поверх само себя.
      Аналогично для `NewSourcePanel.handleSave` (после `sources.add(...)` получить созданный source, затем `setToken(created.id, token)`).
    - Error path: `catch (err) { toast.error(t(err.message in i18n ? err.message : 'error')) }` — пробрасывать i18n-key из main (Phase 3 throw `'sources.tokenInvalid'` / `'sources.tokenNoAccess'`).
  - modify `src/shared/i18n/locales/{en,ru}.ts` — keys: `sources.token`, `sources.tokenPlaceholder` (`github_pat_...`), `sources.tokenChange` (aria/tooltip pencil), `sources.tokenInvalid`, `sources.tokenNoAccess`, `sources.tokenSaved`, `sources.tokenSaveError`.
- **How:** Никаких ручных useMemo/useCallback (CLAUDE.md §10). Pencil-icon: `Pencil` из `lucide-react`. `Field` + `FieldLabel` для семантики. Spacing — `FieldRow` (compact из прошлой задачи).
- **Reuse:** `Field`/`FieldLabel` (installed), `Switch` (installed), `Button` (installed), `InputGroup` (новый, add via CLI), `Pencil` icon (`lucide-react`), `toast` (`src/shared/lib/toast`), `useT` (`src/shared/i18n`).
- **Depends on:** Phase 2

---

## Phase 4 Assessment (after isplan-fix-loop)

```
[x] FSD direction      — feature self-contained
[x] app → pages/widgets — не затрагивается
[x] Context+hook split — нет нового context
[x] IPC-пары           — 4 новых канала, validate-ipc.ts/requireString на всех args (replaces String() coercion)
[x] События            — нет новых app:event
[x] Types placement    — hasToken (computed, JSDoc) в shared/types/vault.ts; mask util pure в app/utils/; SourceTokens type в app/types/services.ts; ipc-расширение в shared/types/ipc.ts; import type через verbatimModuleSyntax
[x] Cion Suite пакеты  — createSecureStorage + Logger через services DI
[x] UI через /shadcn   — skill вызван; CLI add input-group; src/shared/ui/shadcn/** руками не трогаем
[x] Tailwind v4        — только семантические токены
[x] React 19 Compiler  — нет ручных useMemo / useCallback
[x] Reuse-контракт     — заполнено; requireString вынесен в app/utils/validate-ipc.ts (DRY-rescue)
[x] KISS               — disabled-input достаточно, drop redundant userSelect/onCopy
[x] Scope              — 4 фазы
[x] Server-side single source of truth — sources:remove и sources:update сами чистят токен; не renderer
[x] Logger в catch     — sources-store / get-scripts:list (вместо console.warn)
[x] Mask refresh       — useEffect deps на [source.id, source.hasToken]
[x] Empty-token guard  — token.trim().length > 0 на set
[x] a11y               — aria-label на pencil button
[x] Before-ship invariants — electron-builder/updater не затрагиваем
```

---

## Manual test plan (после Phase 4)

Secure-store (Windows DPAPI) silently failing — главный риск. Прогнать:

1. **Public repo** (без `isPrivate`) — sync + download без изменений, fetch без auth header.
2. **Private repo, добавить новый источник:**
   - switch `Private` → поле PAT появляется, editable.
   - Save без PAT → ошибка (token validation).
   - Save с валидным fine-grained PAT → токен в secure-store, маска возвращается.
3. **Existing private source открыть в Settings panel:**
   - PAT-поле disabled, value = `github_pat_1***X`.
   - Попытка copy/paste/right-click — браузер блокирует (disabled).
   - Pencil → поле очищается, editable, type=password.
   - Cancel (закрыть dialog без save) → reopen → старый токен остался.
   - Replace + Save → новый токен записан, маска обновилась.
4. **Toggle `Private` → off** → save → токен удалён server-side (verify через перезапуск app + reopen).
5. **Удалить source** → токен удалён из secure-store.
6. **Sync с невалидным токеном** → toast «invalid token», не silent 404.
7. **Sync с истёкшим scope** (404 на private) → toast «no access».
8. **Rate-limit edge** — после ~5000 auth'd запросов: `x-ratelimit-remaining=0` → rate-limit message (не auth error).

## Before merge

`/ship` — typecheck + lint + FSD audit + build.

## Out of scope (отдельные эпики, если потребуется)

- GitHub OAuth Device Flow (zero-friction auth) — отдельный план, нужны `client_id` + endpoint регистрация GitHub OAuth App.
- Audit-log входов / token expiry warnings.
- Rate-limit info в UI (X-RateLimit-Remaining badge).
- Token rotation reminders.
