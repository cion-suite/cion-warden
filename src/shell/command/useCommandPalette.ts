import { useEffect, useState } from 'react';

/** Символ модификатора для подсказок: Cmd на macOS, иначе Ctrl. */
export const MOD_KEY = navigator.userAgent.includes('Mac') ? '⌘' : 'Ctrl';

type CommandPalette = {
    open: boolean;
    setOpen: (open: boolean) => void;
};

/** Состояние палитры и глобальное Ctrl/Cmd+K. */
export function useCommandPalette(): CommandPalette {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        // code, а не key: не зависит от раскладки
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.code !== 'KeyK' || !(event.ctrlKey || event.metaKey)) return;
            event.preventDefault();
            setOpen((value) => !value);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    return { open, setOpen };
}
