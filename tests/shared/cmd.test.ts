import { describe, expect, it } from 'vitest';
import { cmd } from '@shared/cmd';

const META_SAMPLES = ['a & b', 'a|b', 'a<b', 'a>b', 'a^b', 'a"b', 'a`b', 'a$b', 'a;b', 'a(b', 'a)b', 'a\nb', 'a\tb', 'a\0b'];

describe('cmd.allows', () => {
    it('пропускает обычный путь', () => {
        expect(cmd.allows('C:\\v\\id\\scripts\\my script.ahk')).toBe(true);
    });

    it('отвергает метасимволы', () => {
        for (const text of META_SAMPLES) expect(cmd.allows(text)).toBe(false);
    });
});
