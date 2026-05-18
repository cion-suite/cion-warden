export const en = {
    common: {
        hello: 'Hello',
        cancel: 'Cancel',
        confirm: 'Confirm',
        close: 'Close',
        loading: 'Loading…',
        retry: 'Retry',
        error: 'Error',
        ok: 'OK',
        yes: 'Yes',
        no: 'No',
        nav: {
            home: 'Home',
            settings: 'Settings',
            unknown: 'Unknown',
            toggleSidebar: 'Toggle sidebar',
            section: { main: 'Main' },
        },
        theme: {
            toggle: 'Toggle theme',
            light: 'Light',
            dark: 'Dark',
        },
        locale: { toggle: 'Toggle language' },
        home: {
            tabs: {
                overview: 'Overview',
                diagnostics: 'Diagnostics',
                activity: 'Activity',
            },
            status: {
                ok: 'OK',
                warn: 'Pending',
                off: 'Off',
            },
            overview: {
                runtime: 'Runtime',
                runtimeWaiting: 'Waiting…',
                theme: 'Theme',
                locale: 'Language',
                updater: 'Updater',
            },
            runtime: {
                title: 'Runtime',
                description: 'app:ready event from main process',
                waiting: 'Waiting for app:ready…',
                ready: 'Ready at',
            },
            theme: {
                title: 'Theme',
                description: 'next-themes provider',
                current: 'Current',
                resolved: 'Resolved',
            },
            i18n: {
                title: 'Localization',
                description: 'i18next + react-i18next',
                current: 'Current locale',
            },
            ui: {
                title: 'UI primitives',
                description: 'shadcn + sonner + radix smoke test',
                toast: 'Toast',
                tooltip: 'Tooltip',
            },
            updater: {
                title: 'Updater bridge',
                description: 'window.app.updater',
                available: 'Bridge available',
                missing: 'Bridge missing — preload not wired',
                channel: 'Channel',
            },
            activity: {
                empty: 'No events yet. State changes will appear here.',
                clear: 'Clear',
                events: {
                    ready: 'Main process ready',
                    themeChanged: 'Theme changed',
                    localeChanged: 'Language changed',
                    channelChanged: 'Update channel changed',
                },
            },
        },
        settings: {
            groups: {
                appearance: 'Appearance',
                updates: 'Updates',
            },
            theme: {
                label: 'Theme',
                description: 'Choose how the UI renders. System follows the OS preference.',
            },
            locale: {
                label: 'Language',
                description: 'Switch the interface language.',
            },
            updater: {
                label: 'Update channel',
                description: 'Beta receives pre-release builds first.',
                stable: 'Stable',
                beta: 'Beta',
                unavailable: 'Updater bridge unavailable in dev preview.',
                checking: 'Checking…',
                checkNow: 'Check for updates',
            },
        },
    },
} as const;
