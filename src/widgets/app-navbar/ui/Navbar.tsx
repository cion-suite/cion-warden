import { useLocation } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { Button } from '@/shared/ui/shadcn/button';
import { Separator } from '@/shared/ui/shadcn/separator';
import { useSidebar } from '@/shared/ui/shadcn/sidebar';
import { LocaleToggle } from '@/shared/ui/locale-toggle';
import { ThemeToggle } from '@/shared/ui/theme-toggle';
import { findNavItem } from '@/shared/config/nav';
import { useT } from '@/shared/i18n';

function SidebarToggle() {
    const { toggleSidebar, state } = useSidebar();
    const t = useT();
    const Icon = state === 'expanded' ? PanelLeftClose : PanelLeftOpen;
    return (
        <Button variant="ghost" size="icon-sm" onClick={toggleSidebar}>
            <Icon />
            <span className="sr-only">{t('nav.toggleSidebar')}</span>
        </Button>
    );
}

export function Navbar() {
    const t = useT();
    const { pathname } = useLocation();
    const current = findNavItem(pathname);
    const title = current ? t(current.i18nKey) : t('nav.unknown');

    return (
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-sm">
            <SidebarToggle />
            <Separator
                orientation="vertical"
                className="h-5 data-vertical:self-center"
            />
            <span className="font-semibold">{title}</span>
            <div className="ml-auto flex items-center gap-1">
                <LocaleToggle />
                <ThemeToggle />
            </div>
        </header>
    );
}
