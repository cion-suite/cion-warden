import { useNavigate, useLocation } from 'react-router-dom';
import { PanelLeftIcon, RefreshCwIcon } from 'lucide-react';
import { settings, useSetting } from '@cion-suite/core/renderer';

import {
    Command,
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
    CommandShortcut,
} from '@/ui/shadcn/command';
import { useSidebar } from '@/ui/shadcn/sidebar';
import { THEME_OPTIONS } from '@/ui/theme';
import { SECTIONS } from '@/shell/sidebar';
import { useUpdaterRefresh } from '@/shell/update';
import { SUPPORTED_LOCALES, useLocale, useT } from '@/lib/i18n';
import { MOD_KEY } from './useCommandPalette';

export function CommandPalette({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const t = useT();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const theme = useSetting('theme');
    const locale = useLocale();
    const { toggleSidebar } = useSidebar();
    const updater = useUpdaterRefresh();

    // Закрываем до действия: палитра не перехватывает фокус
    const run = (action: () => void) => () => {
        onOpenChange(false);
        action();
    };

    return (
        <CommandDialog
            open={open}
            onOpenChange={onOpenChange}
            title={t('shell.palette.title')}
            description={t('shell.palette.description')}
            // Верх чуть выше центра, но не выше 1rem: ввод не прыгает
            className="top-[max(1rem,calc(50%-12rem))]"
        >
            <Command>
                <CommandInput placeholder={t('shell.palette.placeholder')} />
                {/* Список ужимается под окно, а не уходит за низ */}
                <CommandList className="max-h-[min(18rem,calc(100svh-6rem))]">
                    <CommandEmpty>{t('shell.palette.empty')}</CommandEmpty>
                    <CommandGroup heading={t('shell.palette.sections')}>
                        {SECTIONS.map((section) => (
                            <CommandItem
                                key={section.path}
                                value={t(section.i18nKey)}
                                data-checked={pathname === section.path}
                                onSelect={run(() => navigate(section.path))}
                            >
                                <section.icon />
                                {t(section.i18nKey)}
                            </CommandItem>
                        ))}
                    </CommandGroup>
                    <CommandSeparator />
                    <CommandGroup heading={t('shell.palette.theme')}>
                        {THEME_OPTIONS.map(({ value, icon: Icon }) => (
                            <CommandItem
                                key={value}
                                value={`${t('shell.palette.theme')} ${t(`theme.${value}`)}`}
                                data-checked={theme === value}
                                onSelect={run(() => void settings.set('theme', value))}
                            >
                                <Icon />
                                {t(`theme.${value}`)}
                            </CommandItem>
                        ))}
                    </CommandGroup>
                    <CommandSeparator />
                    <CommandGroup heading={t('shell.palette.language')}>
                        {SUPPORTED_LOCALES.map((value) => (
                            <CommandItem
                                key={value}
                                value={`${t('shell.palette.language')} ${t(`locale.name.${value}`)}`}
                                data-checked={locale === value}
                                onSelect={run(() => void settings.set('locale', value))}
                            >
                                <span className="w-4 text-center font-mono text-xs">
                                    {value.toUpperCase()}
                                </span>
                                {t(`locale.name.${value}`)}
                            </CommandItem>
                        ))}
                    </CommandGroup>
                    <CommandSeparator />
                    <CommandGroup heading={t('shell.palette.actions')}>
                        <CommandItem onSelect={run(toggleSidebar)}>
                            <PanelLeftIcon />
                            {t('nav.toggleSidebar')}
                            <CommandShortcut>{MOD_KEY} B</CommandShortcut>
                        </CommandItem>
                        <CommandItem
                            disabled={updater.checking}
                            onSelect={run(() => void updater.check())}
                        >
                            <RefreshCwIcon />
                            {t('shell.palette.checkUpdates')}
                        </CommandItem>
                    </CommandGroup>
                </CommandList>
            </Command>
        </CommandDialog>
    );
}
