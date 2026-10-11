import { describe, it, expect } from 'vitest';

import { keyBind } from '@/ui/key-bind';

describe('keyBind.key: KeyboardEvent.key в имя AutoHotkey', () => {
    it.each([
        [' ', 'Space'],
        ['Control', 'Ctrl'],
        ['ArrowUp', 'Up'],
        ['ArrowDown', 'Down'],
        ['ArrowLeft', 'Left'],
        ['ArrowRight', 'Right'],
        ['PageDown', 'PgDn'],
        ['PageUp', 'PgUp'],
    ])('%j -> %s', (key, name) => {
        expect(keyBind.key(key)).toBe(name);
    });

    it('прочие клавиши без изменений', () => {
        expect(keyBind.key('F5')).toBe('F5');
        expect(keyBind.key('a')).toBe('a');
    });

    it('имена из прототипа объекта не подставляются', () => {
        expect(keyBind.key('constructor')).toBe('constructor');
    });
});

describe('keyBind.button: MouseEvent.button в имя AutoHotkey', () => {
    it.each([
        [0, 'LButton'],
        [1, 'MButton'],
        [2, 'RButton'],
        [3, 'XButton1'],
        [4, 'XButton2'],
    ])('%i -> %s', (button, name) => {
        expect(keyBind.button(button)).toBe(name);
    });

    it('неизвестная кнопка - пустая строка', () => {
        expect(keyBind.button(5)).toBe('');
        expect(keyBind.button(-1)).toBe('');
    });
});
