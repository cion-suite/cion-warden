import { app, nativeTheme } from 'electron';
import { logger, windows, type Splash, type SplashState } from '@cion-suite/core';
import { paths } from '@app/utils/paths';
import type { Theme } from '@shared/settings';

const log = logger.child('Shell');

// Совпадает с фоном splash.html: в светлой теме ОС
// без него splash мигнёт белым.
const DARK_BACKGROUND = '#09090b';

let splash: Splash | null = null;
let splashOpening: Promise<void> | undefined;
let resolveMainShown: () => void;
const mainShown = new Promise<void>((resolve) => {
    resolveMainShown = resolve;
});

export const shell = {
    splash: {
        // Один промис на start и main.open; сбой splash не фатален
        open(): Promise<void> {
            splashOpening ??= windows
                .splash({
                    icon: paths.icon(),
                    filePath: paths.splash(),
                    backgroundColor: DARK_BACKGROUND,
                    version: app.getVersion(),
                    status: 'Starting',
                    progress: 0,
                })
                .then(
                    (opened) => {
                        splash = opened;
                    },
                    (error) => log.error('Splash failed to open', error),
                );
            return splashOpening;
        },
        // Не бросает; без открытого splash - no-op
        update(state: SplashState): void {
            void splash?.update(state);
        },
        close(): void {
            splash?.close();
        },
    },

    main: {
        /** Окно, показ ядром, закрытие splash. Отказ фатален. */
        async open(): Promise<void> {
            await shell.splash.open();
            shell.splash.update({ progress: 90, status: 'Loading interface' });

            const win = await windows.create({
                key: 'main',
                persist: 'main',
                icon: paths.icon(),
                preload: paths.preload(),
                url: paths.page(),
                show: 'content',
                width: 900,
                height: 450,
                minWidth: 800,
                minHeight: 400,
            });

            // Кнопки мыши назад/вперёд закрыли бы открытые диалоги
            win.on('app-command', (event, command) => {
                if (command === 'browser-backward' || command === 'browser-forward') event.preventDefault();
            });

            shell.splash.close();
            resolveMainShown();
        },
        focus: () => void windows.focus('main'),
        shown: () => mainShown,
    },

    theme: {
        set(theme: Theme): void {
            nativeTheme.themeSource = theme;
        },
    },
};
