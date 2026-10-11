const KEY_NAMES = new Map([
    [' ', 'Space'],
    ['Control', 'Ctrl'],
    ['ArrowUp', 'Up'],
    ['ArrowDown', 'Down'],
    ['ArrowLeft', 'Left'],
    ['ArrowRight', 'Right'],
    ['PageDown', 'PgDn'],
    ['PageUp', 'PgUp'],
]);

const BUTTON_NAMES = ['LButton', 'MButton', 'RButton', 'XButton1', 'XButton2'];

export const keyBind = {
    /** `KeyboardEvent.key` в имя клавиши AutoHotkey. */
    key(key: string): string {
        return KEY_NAMES.get(key) ?? key;
    },

    /** `MouseEvent.button` в имя кнопки AutoHotkey, '' - нет. */
    button(button: number): string {
        return BUTTON_NAMES[button] ?? '';
    },
};
