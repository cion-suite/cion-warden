import { describe, expect, it } from 'vitest';
import { ahk } from '@app/scripts/ahk';

describe('ahk.includes', () => {
    it('простые, кавычки, Again и CRLF', () => {
        const text = ['#Include lib\\a.ahk', '  #IncludeAgain "lib\\with space.ahk"', '#include b.ahk'].join('\r\n');

        expect(ahk.includes(text)).toEqual(['lib\\a.ahk', 'lib\\with space.ahk', 'b.ahk']);
    });

    it('флаг *i снимается, пустая цель пропускается', () => {
        expect(ahk.includes('#Include *i lib\\x.ahk\n#Include *i\n#Include')).toEqual(['lib\\x.ahk']);
    });

    it('<Func> и %Var% не разрешаются статически', () => {
        expect(ahk.includes('#Include <Func>\n#Include %A_ScriptDir%\\x.ahk')).toEqual([]);
    });

    it('комментарий только после пробела и `;`', () => {
        expect(ahk.includes('#Include a.ahk ; note\n#Include b;c.ahk')).toEqual(['a.ahk', 'b;c.ahk']);
    });

    it('не директива - пропуск', () => {
        expect(ahk.includes('MsgBox "#Include x.ahk"\n; #Include y.ahk')).toEqual([]);
    });
});
