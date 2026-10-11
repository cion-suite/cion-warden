import { kernel, settings } from '@cion-suite/core';
import { shell } from '@app/shell';

export const shellModule = kernel.module({
    id: 'shell',
    // Тема до первого окна; не на импорте:
    // settings.configure ещё не вызван
    start: () => {
        shell.theme.set(settings.get('theme'));
        settings.on('theme', shell.theme.set);
        return shell.splash.open();
    },
});
