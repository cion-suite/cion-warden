import { LanguagesIcon } from 'lucide-react';
import { settings } from '@cion-suite/core/renderer';

import { Button } from '@/ui/shadcn/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from '@/ui/shadcn/dropdown-menu';
import { SUPPORTED_LOCALES, useLocale, useT } from '@/lib/i18n';

export function LocaleMenu() {
    const t = useT();
    const locale = useLocale();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
                <LanguagesIcon />
                <span className="sr-only">{t('locale.toggle')}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                    <DropdownMenuLabel>{t('shell.navbar.language')}</DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                        value={locale}
                        onValueChange={(value) => {
                            const next = SUPPORTED_LOCALES.find((item) => item === value);
                            if (next) void settings.set('locale', next);
                        }}
                    >
                        {SUPPORTED_LOCALES.map((value) => (
                            <DropdownMenuRadioItem key={value} value={value}>
                                {t(`locale.name.${value}`)}
                            </DropdownMenuRadioItem>
                        ))}
                    </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
