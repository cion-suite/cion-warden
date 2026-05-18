export const ru = {
    common: {
        hello: 'Привет',
        cancel: 'Отмена',
        confirm: 'Подтвердить',
        close: 'Закрыть',
        loading: 'Загрузка…',
        retry: 'Повторить',
        error: 'Ошибка',
        ok: 'ОК',
        yes: 'Да',
        no: 'Нет',
        nav: {
            home: 'Главная',
            settings: 'Настройки',
            unknown: 'Неизвестно',
            toggleSidebar: 'Переключить сайдбар',
            section: { main: 'Основное' },
        },
        theme: {
            toggle: 'Переключить тему',
            light: 'Светлая',
            dark: 'Тёмная',
        },
        locale: { toggle: 'Переключить язык' },
        home: {
            tabs: {
                overview: 'Обзор',
                diagnostics: 'Диагностика',
                activity: 'Активность',
            },
            status: {
                ok: 'OK',
                warn: 'Ожидание',
                off: 'Откл',
            },
            overview: {
                runtime: 'Рантайм',
                runtimeWaiting: 'Ожидание…',
                theme: 'Тема',
                locale: 'Язык',
                updater: 'Обновления',
            },
            runtime: {
                title: 'Рантайм',
                description: 'Событие app:ready от main-процесса',
                waiting: 'Ожидание app:ready…',
                ready: 'Готов в',
            },
            theme: {
                title: 'Тема',
                description: 'провайдер next-themes',
                current: 'Текущая',
                resolved: 'Разрешённая',
            },
            i18n: {
                title: 'Локализация',
                description: 'i18next + react-i18next',
                current: 'Текущая локаль',
            },
            ui: {
                title: 'UI-примитивы',
                description: 'дым-тест shadcn + sonner + radix',
                toast: 'Toast',
                tooltip: 'Tooltip',
            },
            updater: {
                title: 'Мост updater',
                description: 'window.app.updater',
                available: 'Мост доступен',
                missing: 'Мост отсутствует — preload не подключён',
                channel: 'Канал',
            },
            activity: {
                empty: 'Событий пока нет. Изменения состояния появятся здесь.',
                clear: 'Очистить',
                events: {
                    ready: 'Main-процесс готов',
                    themeChanged: 'Тема изменена',
                    localeChanged: 'Язык изменён',
                    channelChanged: 'Канал обновлений изменён',
                },
            },
        },
        settings: {
            groups: {
                appearance: 'Внешний вид',
                updates: 'Обновления',
            },
            theme: {
                label: 'Тема',
                description: 'Как отрисовывается интерфейс. Системная следит за ОС.',
            },
            locale: {
                label: 'Язык',
                description: 'Переключение языка интерфейса.',
            },
            updater: {
                label: 'Канал обновлений',
                description: 'Beta получает pre-release сборки первой.',
                stable: 'Стабильный',
                beta: 'Бета',
                unavailable: 'Мост updater недоступен в dev-preview.',
                checking: 'Проверка…',
                checkNow: 'Проверить обновления',
            },
        },
    },
} as const;
