#!/usr/bin/env node
// Тело раздела версии из md-лога для GitHub Release (CI).
//   node scripts/release-notes.mjs <файл.md> <версия>
//   node scripts/release-notes.mjs --selftest
// Вне .claude/: CI не зависит от Claude-тулинга.

import { readFileSync } from 'node:fs';

// ЕДИНЫЙ формат заголовка. Копии: notes.mjs (.claude)
// и changelog-filter.ts (renderer): менять все три разом.
const VERSION_HEADING = /^### Версия v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)[ \t]*$/;

// Тело кончается `---` или следующим заголовком уровня 3
function extract(markdown, version) {
    const lines = markdown.replace(/^\uFEFF/, '').split(/\r?\n/);
    const start = lines.findIndex(l => l.match(VERSION_HEADING)?.[1] === version);
    if (start < 0) return null;
    let end = start + 1;
    while (end < lines.length && lines[end].trim() !== '---' && !/^###\s/.test(lines[end])) end++;
    return lines.slice(start + 1, end).join('\n').trim();
}

function selftest() {
    let failed = 0;
    const check = (name, ok) => { if (!ok) { failed++; console.error(`FAIL ${name}`); } };
    const log = '### Версия v1.1.0\r\n\r\n- Новое.\r\n- Ещё.\r\n\r\n---\r\n\r\n### Версия v1.0.0\r\n\r\n- Старое.\r\n';
    check('первый раздел', extract(log, '1.1.0') === '- Новое.\n- Ещё.');
    check('последний раздел', extract(log, '1.0.0') === '- Старое.');
    check('нет раздела', extract(log, '2.0.0') === null);
    check('пустой файл', extract('', '1.0.0') === null);
    check('версия не префикс', extract('### Версия v1.0.0-rc.1\n\n- x\n', '1.0.0') === null);
    check('без разделителя', extract('### Версия v1.0.0\n- a\n### Версия v0.9.0\n- b\n', '1.0.0') === '- a');
    check('BOM', extract('\uFEFF### Версия v1.0.0\n- a\n', '1.0.0') === '- a');
    check('категории в теле', extract('### Версия v1.0.0\n\n#### Важно знать\n\n- a\n\n#### Интерфейс\n\n- b\n\n---\n\n### Версия v0.9.0\n\n- c\n', '1.0.0')
        === '#### Важно знать\n\n- a\n\n#### Интерфейс\n\n- b');
    check('пустое тело', extract('### Версия v1.0.0\n\n---\n', '1.0.0') === '');
    if (failed) { console.error(`selftest: упало ${failed}`); return 1; }
    console.log('selftest: OK');
    return 0;
}

const [file, rawVersion] = process.argv.slice(2);
if (file === '--selftest') process.exit(selftest());
if (!file || !rawVersion) {
    console.error('использование: node scripts/release-notes.mjs <файл.md> <версия>');
    process.exit(2);
}

const version = rawVersion.replace(/^v/, '');
let body = null;
try {
    body = extract(readFileSync(file, 'utf8'), version);
} catch (e) {
    console.error(`ОТКАЗ: не прочитать ${file} - ${e.message}`);
    process.exit(1);
}
if (!body) {
    console.error(`ОТКАЗ: в ${file} нет раздела "### Версия v${version}" с буллетами - релиз без лога не создаётся`);
    process.exit(1);
}
console.log(body);
