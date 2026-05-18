---
description: Generate changelog entry for uncommitted changes (or a range if argument given). Primary use case — uncommitted.
allowed-tools: Bash, Read, Glob, Grep
---

# /notes — Changelog Entry Generator

Release notes в двух аудиториях: end-users + git commit. Детерминирован по scope и записи.

## Input

`$ARGUMENTS` — опционально git-range (`0.5.5..0.5.6`). Пусто → UNCOMMITTED mode.

## Scope

### RANGE mode (`$ARGUMENTS` непустой)

`git log --oneline $ARGUMENTS` + `git diff $ARGUMENTS`. Опционально `Read` ключевых файлов.

### UNCOMMITTED mode

**Запрещено:** `git log`, `git show`, `git reflog`, `git cherry`, `git rev-list` (любые формы). Тему бери из diff'а.

**Граница scope.** Прошлый `/notes` мог записать entry в `changelog.txt` без коммита — повторный вызов не должен дублировать. Граница = mtime `changelog.txt`.

1. Проверка границы:
   ```bash
   test -s changelog.txt && echo BOUNDED || echo UNBOUNDED
   ```

2. Файлы scope:
   ```bash
   # BOUNDED — только новее changelog.txt:
   for f in $(git diff HEAD --name-only); do [ "$f" -nt changelog.txt ] && echo "$f"; done
   git status --short | awk '/^\?\?/ {print $2}' | while read f; do [ "$f" -nt changelog.txt ] && echo "$f"; done

   # UNBOUNDED — всё:
   git diff HEAD --name-only
   git status --short | awk '/^\?\?/ {print $2}'
   ```

3. Diff по этим файлам: `git diff HEAD -- <files>`. Untracked → `Read`.

4. **Scope пустой:**
   - `BOUNDED` пустой → «Нет изменений новее последнего entry в changelog.txt.»
   - `UNBOUNDED` пустой → «Нет uncommitted-изменений. Передай range: `/notes 0.6.3..HEAD`.»
   - Выйти. НЕ расширять scope. НЕ fallback на `git log`.

## Version + theme

- **Version** — поле `version` из `package.json` как есть.
- **Theme** — короткое русское слово (≤ 15 символов). Предпочтительно: `фиксы · профили · рефакторинг · документация · перформанс · UI · установка · обновление · Lua · AD · DB · external · безопасность`.

## [USERS] section

End-users desktop-приложения:

- Русский, прошедшее время, безличное (Оптимизирована, Исправлена…).
- Только user-visible. Внутренние правки пропускать.
- Весь релиз внутренний → одна строка: `Оптимизирована внутренняя архитектура приложения.`
- Без жаргона, без имён классов/путей.
- 1–5 bullet'ов. ASCII + кириллица.

## [GIT] section

Commit-сообщение:

- Русский, прошедшее время, безличное. Императив (Упрощена, Удалён, Исправлена…).
- ~80 символов на bullet. **ЧТО** изменилось, не **КАК**.
- Без имён классов/сигнатур/путей.
- 3–8 bullet'ов. Близкие сливать. Порядок: фичи → улучшения → фиксы.
- ASCII + кириллица.

## Format

```
<version> - <theme>

[USERS]
- ...

[GIT]
- ...
```

## Append to changelog.txt

**Только `Bash` heredoc `cat >> changelog.txt <<'EOF' … EOF`.** Никогда `Write` / `Edit` / `sed -i` / `>` / Read-modify-Write.

```bash
# Непустой файл — лидирующий разделитель:
cat >> changelog.txt <<'EOF'

---

<version> - <theme>

[USERS]
- ...

[GIT]
- ...
EOF

# Пустой/отсутствует — без разделителя:
cat >> changelog.txt <<'EOF'
<version> - <theme>

[USERS]
- ...

[GIT]
- ...
EOF
```

Разделитель — строго `\n\n---\n\n`. Не выдумывать `===`, `***`, даты.

Heredoc сломался → не переключаться на Edit/Write. Сообщить пользователю, остановиться.

## Verify

```bash
tail -n 30 changelog.txt
```

Новый entry в конце, отделён `\n\n---\n\n` (если был непуст), предыдущий нетронут. Не так → не чинить руками, показать tail пользователю.

## Output

Вывести финальный блок в чат ровно по формату. Без префиксов/пояснений.

## Example

```
0.5.4 - фиксы

[USERS]
- Исправлены проблемы с кодировкой при редактировании профилей.
- Исправлена загрузка статусов у компьютеров пользователей.

[GIT]
- Исправлена кодировка UTF-8 при записи атрибутов через PowerShell.
- Исправлена загрузка статусов компьютеров из кеша.
- Добавлена обработка таймаута при проверке доступности DC.
```
