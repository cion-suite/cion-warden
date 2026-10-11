import { describe, expect, it } from 'vitest';
import { ahk } from '@app/utils/ahk';
import type { ConfigSchema, ConfigValues } from '@shared/types';

const BOM = '\u{FEFF}';

// Образцы wf-macro: cfg_cyt08, cfg_sculptor_updater,
// cfg_hildryn, game_settings
const CYT08 = [
    '; @Tooltip Chat spam on and off',
    '; @Bind',
    'StartStopKey = LButton ; Enable chat spam',
    '',
    '; @Tooltip Spam delay',
    '; @Value',
    'SpamTime := 300',
    '',
    '; @Title Misc',
    '',
    '; @Tooltip Reload',
    '; @Bind',
    'MiscReloadMacroKey = Insert ; Reload macros',
    '',
    '; @Bind',
    'MiscPauseKey = F11 ; Pause / resume macros',
];

const SCULPTOR = [
    '; @Bind',
    'AbilityKey = 2 ; Disable',
    '',
    '; @Value',
    'DelayBetweenCasts = 10 ; Delay in seconds',
];

const HILDRYN = [...CYT08.slice(14), '', 'Abil_2_Cooldown := 5000'];

const GAME = [
    'fps             = 144            ; Average ingame fps',
    '',
    '; Control keys',
    'shootKey        = F9             ; Fire Weapon',
    'aimKey          = [              ; Aim Weapon',
    'operatorKey     = ]              ; Focus and Transference',
    '',
    '; Misc',
    'fpsLockKey      = PgDn           ; Fps Lock Key',
    'fpsUncapKey     = Up             ; Fps Uncap Key',
];

const crlf = (lines: string[]): string => lines.join('\r\n');
const lf = (lines: string[]): string => lines.join('\n');

const keys = (schema: ConfigSchema): string[] => schema.sections.flatMap(s => s.fields.map(f => f.key));

const defaults = (schema: ConfigSchema): ConfigValues =>
    Object.fromEntries(schema.sections.flatMap(s => s.fields.map(f => [f.key, f.default])));

const SAMPLES: Array<[string, string]> = [
    ['cyt08 BOM CRLF', BOM + crlf(CYT08)],
    ['cyt08 LF final newline', lf(CYT08) + '\n'],
    ['sculptor', lf(SCULPTOR)],
    ['hildryn hidden', BOM + lf(HILDRYN)],
    ['game_settings', lf(GAME)],
];

describe('ahk.includes', () => {
    it('простые, кавычки, Again и CRLF', () => {
        const text = ['#Include lib\\a.ahk', '  #IncludeAgain "lib\\with space.ahk"', '#include b.ahk'].join('\r\n');

        expect(ahk.includes(text)).toEqual(['lib\\a.ahk', 'lib\\with space.ahk', 'b.ahk']);
    });

    it('флаг *i снимается, пустая цель пропускается', () => {
        expect(ahk.includes('#Include *i lib\\x.ahk\n#Include *i\n#Include')).toEqual(['lib\\x.ahk']);
    });

    it('<Func> и %Var% не разрешаются статически', () => {
        expect(ahk.includes('#Include <Func>\n#Include cfg\\cfg_%A_Scriptname%')).toEqual([]);
    });

    it('%A_ScriptDir% снимается, каталог не цель', () => {
        const text = ['#include %A_ScriptDir%/..', '#Include %A_ScriptDir%\\lib\\x.ahk', '#Include *i %A_ScriptDir%/y.ahk'];

        expect(ahk.includes(text.join('\n'))).toEqual(['lib\\x.ahk', 'y.ahk']);
    });

    it('комментарий только после пробела или таба и `;`', () => {
        expect(ahk.includes('#Include a.ahk ; note\n#Include b;c.ahk\n#Include d.ahk\t; tab')).toEqual([
            'a.ahk',
            'b;c.ahk',
            'd.ahk',
        ]);
    });

    it('BOM перед первой директивой', () => {
        expect(ahk.includes(`${BOM}#Include a.ahk\n#Include b.ahk`)).toEqual(['a.ahk', 'b.ahk']);
    });

    it('не директива - пропуск', () => {
        expect(ahk.includes('MsgBox "#Include x.ahk"\n; #Include y.ahk')).toEqual([]);
    });
});

describe('ahk.parse: строгий режим', () => {
    it('секции, типы, label, tooltip и значения cfg', () => {
        expect(ahk.parse(BOM + crlf(CYT08))).toEqual({
            sections: [
                {
                    title: '',
                    fields: [
                        { key: 'StartStopKey', label: 'Enable chat spam', type: 'hotkey', default: 'LButton', tooltip: 'Chat spam on and off' },
                        { key: 'SpamTime', label: 'SpamTime', type: 'number', default: 300, tooltip: 'Spam delay' },
                    ],
                },
                {
                    title: 'Misc',
                    fields: [
                        { key: 'MiscReloadMacroKey', label: 'Reload macros', type: 'hotkey', default: 'Insert', tooltip: 'Reload' },
                        { key: 'MiscPauseKey', label: 'Pause / resume macros', type: 'hotkey', default: 'F11' },
                    ],
                },
            ],
        });
    });

    it('@Bind с числом - hotkey-строка, @Value с числом - number', () => {
        const [section] = ahk.parse(lf(SCULPTOR)).sections;

        expect(section?.fields).toMatchObject([
            { key: 'AbilityKey', type: 'hotkey', default: '2' },
            { key: 'DelayBetweenCasts', type: 'number', default: 10, label: 'Delay in seconds' },
        ]);
    });

    it('@Value не число - string, кавычки и `""` снимаются', () => {
        const text = ['; @Value', 'Name = hello world ; who', '; @Value', 'Greeting := "say ""hi"" ; no"', '; @Value', 'Quoted := "300"'];

        expect(ahk.parse(lf(text)).sections[0]?.fields).toMatchObject([
            { key: 'Name', type: 'string', default: 'hello world', label: 'who' },
            { key: 'Greeting', type: 'string', default: 'say "hi" ; no', label: 'Greeting' },
            { key: 'Quoted', type: 'string', default: '300' },
        ]);
    });

    it('скрытая константа без аннотации - не поле', () => {
        expect(keys(ahk.parse(lf(HILDRYN)))).toEqual(['MiscPauseKey']);
    });

    it('в строгом режиме комментарий над группой - не заголовок', () => {
        const text = ['; Control keys', '; @Bind', 'a = 1'];

        expect(ahk.parse(lf(text)).sections[0]?.title).toBe('');
    });

    it('label после таба, пустой хвост - имя переменной', () => {
        const text = ['; @Bind', 'a = F1\t; tabbed', '; @Bind', 'b = F2 ;', '; @Bind', 'c = F3'];

        expect(ahk.parse(lf(text)).sections[0]?.fields.map(f => f.label)).toEqual(['tabbed', 'b', 'c']);
    });

    it('пустой бинд допустим', () => {
        const text = ['; @Bind', 'a = ; none', '; @Bind', 'b =', '; @Bind', 'c=  '];

        expect(ahk.parse(lf(text)).sections[0]?.fields).toMatchObject([
            { key: 'a', default: '', label: 'none' },
            { key: 'b', default: '' },
            { key: 'c', default: '' },
        ]);
    });

    it('`[` `]` и экранированные `;` `%` backtick - значения', () => {
        const text = ['; @Bind', 'a = [', '; @Bind', 'b = ]', '; @Bind', 'c = `; ; semi', '; @Bind', 'd = 100`% ; pct'];

        expect(ahk.parse(lf(text)).sections[0]?.fields.map(f => f.default)).toEqual(['[', ']', ';', '100%']);
    });

    it('аннотация без присваивания и tooltip не вплотную - игнор', () => {
        const text = ['; @Tooltip far', '', '; @Bind', 'a = 1', '; @Bind', '', 'b = 2', '; @Bind', '; @Bind', 'c = 3'];
        const fields = ahk.parse(lf(text)).sections[0]?.fields;

        expect(fields?.map(f => [f.key, f.tooltip])).toEqual([['a', undefined], ['c', undefined]]);
    });

    it('повтор имени без учёта регистра - первое вхождение', () => {
        const text = ['; @Bind', 'Key = F1', '; @Bind', 'KEY = F2'];

        expect(ahk.parse(lf(text)).sections[0]?.fields).toMatchObject([{ key: 'Key', default: 'F1' }]);
    });

    it('`==`, `+=` и вызовы не присваивания', () => {
        const text = ['; @Bind', 'a == 1', '; @Bind', 'b += 1', '; @Bind', 'Run, x.exe'];

        expect(ahk.parse(lf(text)).sections).toEqual([]);
    });
});

describe('ahk.parse: свободный режим', () => {
    it('каждое присваивание - поле, комментарий над группой - секция', () => {
        const { sections } = ahk.parse(lf(GAME));

        expect(sections.map(s => [s.title, s.fields.length])).toEqual([['', 1], ['Control keys', 3], ['Misc', 2]]);
        expect(sections[0]?.fields[0]).toEqual({ key: 'fps', label: 'Average ingame fps', type: 'number', default: 144 });
        expect(sections[1]?.fields.map(f => [f.key, f.type, f.default])).toEqual([
            ['shootKey', 'hotkey', 'F9'],
            ['aimKey', 'hotkey', '['],
            ['operatorKey', 'hotkey', ']'],
        ]);
    });

    it('ложный заголовок: закомментированный код, рамка, заметка посреди группы', () => {
        const text = ['; old = 1', 'a = F1', '', ';;;;;;;;', 'b = F2', '', 'c = F3', '; note', 'd = F4'];

        expect(ahk.parse(lf(text)).sections.map(s => s.title)).toEqual(['']);
        expect(keys(ahk.parse(lf(text)))).toEqual(['a', 'b', 'c', 'd']);
    });

    it('заголовок в кавычках `;;` снимается с обеих сторон', () => {
        expect(ahk.parse(lf([';; Keys ;;', 'a = F1'])).sections[0]?.title).toBe('Keys');
    });

    it('повтор имени в пресете - первое вхождение', () => {
        expect(ahk.parse(lf(['a = F1', 'A = F2'])).sections[0]?.fields).toMatchObject([{ default: 'F1' }]);
    });

    it('без полей - пустая схема', () => {
        expect(ahk.parse('')).toEqual({ sections: [] });
        expect(ahk.parse('; just a comment\n')).toEqual({ sections: [] });
    });
});

describe('ahk.patch', () => {
    it('меняет только значение, комментарий и выравнивание остаются', () => {
        const out = ahk.patch(lf(GAME), { fps: 90, aimKey: 'q' });

        expect(out.split('\n').slice(0, 5)).toEqual([
            'fps             = 90             ; Average ingame fps',
            '',
            '; Control keys',
            'shootKey        = F9             ; Fire Weapon',
            'aimKey          = q              ; Aim Weapon',
        ]);
    });

    it('BOM, CRLF, скрытые константы и отсутствие финального перевода строки', () => {
        const text = BOM + crlf(HILDRYN);
        const out = ahk.patch(text, { MiscPauseKey: 'F12', Abil_2_Cooldown: 1 });

        expect(out).toBe(text.replace('F11', 'F12'));
    });

    it('смешанные EOL сохраняются построчно', () => {
        const text = '; @Bind\r\na = F1\n; @Bind\rb = F2\r\n';

        expect(ahk.patch(text, { a: 'F5', b: 'F6' })).toBe('; @Bind\r\na = F5\n; @Bind\rb = F6\r\n');
    });

    it('оператор `:=`: число без кавычек, строка в кавычках', () => {
        const text = ['; @Value', 'N := 300 ; n', '; @Value', 'S := "a" ; s', '; @Value', 'Compact:=1'].join('\n');

        expect(ahk.patch(text, { N: 5, S: 'say "hi" `x`', Compact: 2 })).toBe(
            ['; @Value', 'N := 5   ; n', '; @Value', 'S := "say ""hi"" ``x``" ; s', '; @Value', 'Compact:=2'].join('\n'),
        );
    });

    it('оператор `=`: `;` `%` и backtick экранируются, края обрезаются', () => {
        const text = ['; @Bind', 'a = F1 ; k'].join('\n');

        expect(ahk.patch(text, { a: ' ;%`x ' })).toBe(['; @Bind', 'a = `;`%``x ; k'].join('\n'));
    });

    it('пустой бинд: запись в пустое и сброс в пустое', () => {
        const text = ['; @Bind', 'a = ; none', '; @Bind', 'b =', '; @Bind', 'c = F3   ; set'].join('\n');
        const out = ahk.patch(text, { a: 'F1', b: 'F2', c: '' });

        expect(out).toBe(['; @Bind', 'a = F1 ; none', '; @Bind', 'b = F2', '; @Bind', 'c =      ; set'].join('\n'));
        expect(ahk.patch(out, { a: '', b: '' }).split('\n')[1]).toBe('a =    ; none');
    });

    it('ключи без учёта регистра, неизвестные игнорируются, повтор имени не трогается', () => {
        const text = ['; @Bind', 'Key = F1', '; @Bind', 'KEY = F2', '; @Bind', 'Other = F3'].join('\n');

        expect(ahk.patch(text, { key: 'F9', nope: 'x' })).toBe(
            ['; @Bind', 'Key = F9', '; @Bind', 'KEY = F2', '; @Bind', 'Other = F3'].join('\n'),
        );
    });

    it('равные значения не переписывают строку, число "2" как строка тоже', () => {
        const text = ['; @Bind', 'k   =   2   ;   x', '; @Value', 'n := 5.0'].join('\n');

        expect(ahk.patch(text, { k: '2', n: 5 })).toBe(text);
    });

    it('перенос значений не затрагивает неаннотированные строки строгого файла', () => {
        const text = ['; @Bind', 'a = F1', 'b = F2 ; hidden'].join('\n');

        expect(ahk.patch(text, { a: 'F3', b: 'F4' })).toBe(['; @Bind', 'a = F3', 'b = F2 ; hidden'].join('\n'));
    });

    it('перевод строки и нечисловое число в значении - validation', () => {
        const text = '; @Bind\na = F1';

        expect(() => ahk.patch(text, { a: 'F1\nRun, calc' })).toThrow();
        expect(() => ahk.patch(text, { a: 'F1\rx' })).toThrow();
        expect(() => ahk.patch(text, { a: Number.NaN })).toThrow();
    });

    it.each(SAMPLES)('patch(parse defaults) не меняет файл: %s', (_name, text) => {
        expect(ahk.patch(text, defaults(ahk.parse(text)))).toBe(text);
    });

    it.each(SAMPLES)('parse(patch(t, v)) возвращает v: %s', (_name, text) => {
        const schema = ahk.parse(text);
        const values: ConfigValues = Object.fromEntries(
            schema.sections.flatMap(s => s.fields.map(f => [f.key, f.type === 'number' ? 7 : 'x;y%z`w'])),
        );

        const out = ahk.patch(text, values);

        expect(defaults(ahk.parse(out))).toEqual(values);
        expect(ahk.patch(out, values)).toBe(out);
    });
});

describe('ahk: регрессии из adversarial-ревью', () => {
    it('значение `=` не склеивается с оператором', () => {
        expect(ahk.patch('; @Bind\na=x', { a: '=' })).toBe('; @Bind\na= =');
        expect(ahk.patch('; @Bind\na =x', { a: '=y' })).toBe('; @Bind\na = =y');
        expect(ahk.parse(ahk.patch('; @Bind\na=x', { a: '=' })).sections[0]?.fields[0]?.default).toBe('=');
    });

    it('пробельное значение - пустой бинд, повторный patch ничего не меняет', () => {
        const once = ahk.patch('; @Bind\na =', { a: ' ' });

        expect(once).toBe('; @Bind\na =');
        expect(ahk.patch(once, { a: ' ' })).toBe(once);
        expect(ahk.patch('; @Bind\na = F1 ; k', { a: 'F1 ' })).toBe('; @Bind\na = F1 ; k');
    });

    it('юникодное имя переменной - поле', () => {
        expect(keys(ahk.parse('; @Bind\nКлавиша = F1'))).toEqual(['Клавиша']);
        expect(ahk.patch('; @Bind\nКлавиша = F1', { клавиша: 'F2' })).toBe('; @Bind\nКлавиша = F2');
    });

    it('#Include: запятая, одиночный CR, флаг вплотную к кавычкам', () => {
        expect(ahk.includes('#Include, lib.ahk\n#Include,x.ahk')).toEqual(['lib.ahk', 'x.ahk']);
        expect(ahk.includes('#Include a.ahk\r#Include b.ahk')).toEqual(['a.ahk', 'b.ahk']);
        expect(ahk.includes('#Include *i"a b.ahk"')).toEqual(['a b.ahk']);
        expect(ahk.includes('#Include , x.ahk')).toEqual(['x.ahk']);
    });

    it('#Include: не флаг `*i` - не цель', () => {
        expect(ahk.includes('#Include *.ahk\n#Include *ilib.ahk')).toEqual([]);
    });

    // Файлы из GitHub недоверенные: нет квадратичных регексов
    it.each([
        ['цифры', `; @Value\na = ${'1'.repeat(200_000)}x`],
        ['цифры `:=`', `; @Value\na := ${'1'.repeat(200_000)}x`],
        ['пробелы после `=`', `; @Bind\na =${' '.repeat(200_000)}x`],
        ['табы после `=`', `; @Bind\na =${'\t'.repeat(200_000)}x`],
        ['tooltip', `; @Tooltip x${' '.repeat(200_000)}y\n; @Bind\na = 1`],
        ['title', `; @Title x${' '.repeat(200_000)}y\n; @Bind\na = 1`],
        ['заголовок пресета', `\n; x${';'.repeat(200_000)}y\na = 1`],
        ['include', `#Include ${' '.repeat(200_000)}x`],
    ])('длинная строка не вешает разбор: %s', (_name, text) => {
        const started = performance.now();

        ahk.parse(text);
        ahk.patch(text, { a: 2 });
        ahk.includes(text);

        expect(performance.now() - started).toBeLessThan(1000);
    });
});
