import { errors, logger } from '@cion-suite/core';
import type { ConfigField, ConfigFieldType, ConfigSchema, ConfigSection, ConfigValues } from '@shared/types';

const log = logger.child('Ahk');

const BOM = '\u{FEFF}';

const DIRECTIVE = /^[ \t]*#Include(?:Again)?\b/i;
const SCRIPT_DIR = /^%A_ScriptDir%[\\/]?/i;
const DIRECTORY = new Set(['', '.', '..']);
const EOL = /\r\n|\n|\r/;
const KEEP_EOL = /(\r\n|\n|\r)/;

const ASSIGNMENT = /^([\p{L}_][\p{L}\p{N}_]*)[ \t]*(:=|=)(?!=)/u;
const ANNOTATION = /^[ \t]*;[ \t]*@(Bind|Value)\b/i;
// Без `(.*?)\s*$`: на длинных строках пробелов он квадратичен
const TOOLTIP = /^[ \t]*;[ \t]*@Tooltip\b(.*)$/is;
const TITLE = /^[ \t]*;[ \t]*@Title\b(.*)$/is;
const COMMENT = /^[ \t]*;/;
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

type Kind = 'bind' | 'value' | 'free';

// name и op уже в head; raw - значение как в файле
interface Assignment {
    name: string;
    op: ':=' | '=';
    head: string;
    lead: string;
    raw: string;
    gap: string;
    tail: string;
}

interface Entry {
    line: number;
    assignment: Assignment;
    value: string | number;
}

const unbom = (text: string): string => (text.startsWith(BOM) ? text.slice(BOM.length) : text);

// Комментарий - только `[ \t];`: иначе `;` часто литерал
function stripComment(line: string): string {
    const match = /[ \t];/.exec(line);
    return match ? line.slice(0, match.index) : line;
}

/**
 * Цели #Include и #IncludeAgain. `%A_ScriptDir%` снимается,
 * прочие `%Var%` и `<Func>` статически не разрешить.
 */
function includes(content: string): string[] {
    const out: string[] = [];
    for (const rawLine of unbom(content).split(EOL)) {
        if (!DIRECTIVE.test(rawLine)) continue;
        let rest = stripComment(rawLine).trim().replace(/^#Include(?:Again)?\b[ \t]*,?/i, '').trim();
        // Флаг `*i` отбрасываем
        rest = rest.replace(/^\*i(?=[\s"]|$)\s*/i, '');
        if (rest.startsWith('"')) {
            const end = rest.indexOf('"', 1);
            rest = end > 1 ? rest.slice(1, end) : '';
        }
        rest = rest.replace(SCRIPT_DIR, '');
        if (DIRECTORY.has(rest) || /^[<*]/.test(rest) || rest.includes('%')) continue;
        out.push(rest);
    }
    return out;
}

// Начало комментария в выражении: `;` в кавычках - данные
function expressionComment(rest: string): number {
    let quoted = false;
    for (let i = 0; i < rest.length; i++) {
        const char = rest[i];
        if (char === '`') i++;
        else if (char === '"') quoted = !quoted;
        else if (!quoted && (char === ' ' || char === '\t') && rest[i + 1] === ';') return i + 1;
    }
    return -1;
}

// Конец без хвостовых пробелов и табов: regex `$` квадратичен
function blankEnd(text: string, extra = ''): number {
    let end = text.length;
    while (end > 0 && ` \t${extra}`.includes(text.charAt(end - 1))) end--;
    return end;
}

function assignment(line: string): Assignment | null {
    const indent = /^[ \t]*/.exec(line)?.[0] ?? '';
    const match = ASSIGNMENT.exec(line.slice(indent.length));
    if (!match) return null;
    const op = match[2] === ':=' ? ':=' : '=';
    const head = line.slice(0, indent.length + match[0].length);
    const rest = line.slice(head.length);
    const found = op === '=' ? /[ \t];/.exec(rest) : null;
    const semicolon = op === '=' ? (found ? found.index + 1 : -1) : expressionComment(rest);
    const body = semicolon === -1 ? rest : rest.slice(0, semicolon);
    const tail = semicolon === -1 ? '' : rest.slice(semicolon);
    const core = body.slice(0, blankEnd(body));
    const gap = body.slice(core.length);
    const lead = /^[ \t]*/.exec(core)?.[0] ?? '';
    return { name: match[1] ?? '', op, head, lead, raw: core.slice(lead.length), gap, tail };
}

function value(item: Assignment): string | number {
    const { op, raw } = item;
    if (op === '=') {
        const text = raw.replace(/`([;%`])/g, '$1');
        return NUMBER.test(text) ? Number(text) : text;
    }
    if (/^"(?:[^"`]|""|`.)*"$/.test(raw)) return raw.slice(1, -1).replace(/""|`(["`])/g, (_, char?: string) => char ?? '"');
    return NUMBER.test(raw) ? Number(raw) : raw;
}

function label(item: Assignment): string {
    return item.tail.replace(/^;+/, '').trim() || item.name;
}

function kindOf(line: string): Kind | null {
    const word = ANNOTATION.exec(line)?.[1]?.toLowerCase();
    return word === 'bind' || word === 'value' ? word : null;
}

function typeOf(kind: Kind, current: string | number): ConfigFieldType {
    if (kind === 'bind') return 'hotkey';
    if (typeof current === 'number') return 'number';
    return kind === 'value' ? 'string' : 'hotkey';
}

function field(item: Assignment, current: string | number, kind: Kind, tooltip: string | undefined): ConfigField {
    const type = typeOf(kind, current);
    const result: ConfigField = {
        key: item.name,
        label: label(item),
        type,
        default: type === 'number' ? current : String(current),
    };
    return tooltip ? { ...result, tooltip } : result;
}

// Заголовок пресета: комментарий в начале группы
function header(lines: string[], i: number): string | null {
    const line = lines[i] ?? '';
    if (!COMMENT.test(line) || /^[ \t]*;[ \t]*@/.test(line)) return null;
    if (i > 0 && (lines[i - 1] ?? '').trim() !== '') return null;
    if (!assignment(lines[i + 1] ?? '')) return null;
    const start = line.replace(/^[\s;]+/, '');
    const text = start.slice(0, blankEnd(start, ';'));
    return /[\p{L}\p{N}]/u.test(text) && !assignment(text) ? text : null;
}

interface Scan {
    sections: ConfigSection[];
    entries: Entry[];
}

function scan(lines: string[]): Scan {
    const strict = lines.some(line => kindOf(line));
    const sections: ConfigSection[] = [];
    const entries: Entry[] = [];
    const seen = new Set<string>();
    let title = '';
    let current: ConfigSection | null = null;

    const add = (line: number, item: Assignment, kind: Kind, above: number): void => {
        const key = item.name.toLowerCase();
        if (seen.has(key)) {
            log.warn(`Duplicate variable ${item.name}: first one wins`);
            return;
        }
        seen.add(key);
        const result = value(item);
        const tooltip = TOOLTIP.exec(lines[above] ?? '')?.[1]?.trim();
        if (!current) {
            current = { title, fields: [] };
            sections.push(current);
        }
        current.fields.push(field(item, result, kind, tooltip));
        entries.push({ line, assignment: item, value: result });
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        const heading = TITLE.exec(line)?.[1]?.trim();
        const free = strict ? null : header(lines, i);
        if (heading !== undefined || free !== null) {
            title = heading ?? free ?? '';
            current = null;
            continue;
        }
        if (strict) {
            const kind = kindOf(line);
            const item = kind ? assignment(lines[i + 1] ?? '') : null;
            if (kind && item) add(i + 1, item, kind, i - 1);
            continue;
        }
        const item = assignment(line);
        if (item) add(i, item, 'free', i - 1);
    }
    return { sections, entries };
}

function split(text: string): { bom: string; parts: string[] } {
    const bom = text.startsWith(BOM) ? BOM : '';
    return { bom, parts: text.slice(bom.length).split(KEEP_EOL) };
}

const linesOf = (parts: string[]): string[] => parts.filter((_, i) => i % 2 === 0);

function parse(text: string): ConfigSchema {
    return { sections: scan(linesOf(split(text).parts)).sections };
}

function literal(item: Assignment, next: string | number): string {
    if (typeof next === 'number') {
        errors.assert(Number.isFinite(next), 'Config value must be finite', 'validation');
        return String(next);
    }
    errors.assert(!/[\r\n]/.test(next), 'Config value must be one line', 'validation');
    if (item.op === '=') return next.trim().replace(/[`;%]/g, '`$&');
    return `"${next.replace(/[`"]/g, (char) => (char === '"' ? '""' : '``'))}"`;
}

function rewrite(item: Assignment, text: string): string {
    const aligned = item.tail !== '' && /^ +$/.test(item.gap);
    const gap = aligned ? ' '.repeat(Math.max(1, item.gap.length + item.raw.length - text.length)) : item.gap;
    // Вплотную к `=` значение `=` дало бы `==`
    const spaced = item.lead === '' && (item.raw === '' || text.startsWith('='));
    const lead = spaced ? ' ' : item.lead;
    return `${item.head}${lead}${text}${gap}${item.tail}`;
}

/**
 * Значения в строки присваивания: остальной текст, BOM и EOL
 * не меняются. Неизвестные ключи и равные значения - пропуск.
 */
function patch(text: string, values: ConfigValues): string {
    const { bom, parts } = split(text);
    const wanted = new Map(Object.entries(values).map(([key, next]) => [key.toLowerCase(), next]));
    for (const { line, assignment: item, value: current } of scan(linesOf(parts)).entries) {
        const next = wanted.get(item.name.toLowerCase());
        if (next === undefined || String(next) === String(current)) continue;
        const literalText = literal(item, next);
        if (literalText !== item.raw) parts[line * 2] = rewrite(item, literalText);
    }
    return bom + parts.join('');
}

export const ahk = { includes, parse, patch };
