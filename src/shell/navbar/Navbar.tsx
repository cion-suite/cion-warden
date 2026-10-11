import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { PanelLeftCloseIcon, PanelLeftOpenIcon, SearchIcon } from 'lucide-react';

import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@/ui/shadcn/breadcrumb';
import { Button } from '@/ui/shadcn/button';
import { Kbd, KbdGroup } from '@/ui/shadcn/kbd';
import { Separator } from '@/ui/shadcn/separator';
import { useSidebar } from '@/ui/shadcn/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';
import { ThemeToggle } from '@/ui/theme';
import { MOD_KEY } from '@/shell/command';
import { SECTIONS } from '@/shell/sidebar';
import { useT } from '@/lib/i18n';
import { useNavbar } from '@/lib/navbar';
import { LocaleMenu } from './LocaleMenu';

function SidebarToggle() {
    const t = useT();
    const { toggleSidebar, state } = useSidebar();
    const Icon = state === 'expanded' ? PanelLeftCloseIcon : PanelLeftOpenIcon;

    // shadcn ловит key 'b': на кириллице Ctrl+B молчит
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.code !== 'KeyB' || !(event.ctrlKey || event.metaKey)) return;
            if (event.key.toLowerCase() === 'b') return;
            event.preventDefault();
            toggleSidebar();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [toggleSidebar]);

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={toggleSidebar}>
                    <Icon />
                    <span className="sr-only">{t('nav.toggleSidebar')}</span>
                </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
                {t('nav.toggleSidebar')}
                <KbdGroup>
                    <Kbd>{MOD_KEY}</Kbd>
                    <Kbd>B</Kbd>
                </KbdGroup>
            </TooltipContent>
        </Tooltip>
    );
}

function PageBreadcrumb() {
    const t = useT();
    const { pathname } = useLocation();
    const { crumb } = useNavbar();
    const current = SECTIONS.find((section) => section.path === pathname);
    const title = current ? t(current.i18nKey) : t('nav.unknown');

    return (
        <Breadcrumb className="min-w-0">
            <BreadcrumbList className="flex-nowrap">
                <BreadcrumbItem className="min-w-0">
                    {crumb?.onBack ? (
                        <BreadcrumbLink asChild className="cursor-pointer truncate">
                            <button type="button" onClick={crumb.onBack}>
                                {title}
                            </button>
                        </BreadcrumbLink>
                    ) : (
                        <BreadcrumbPage className="truncate">{title}</BreadcrumbPage>
                    )}
                </BreadcrumbItem>
                {crumb && (
                    <>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem className="min-w-0">
                            <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
                        </BreadcrumbItem>
                    </>
                )}
            </BreadcrumbList>
        </Breadcrumb>
    );
}

export function Navbar({ onSearch }: { onSearch: () => void }) {
    const t = useT();
    const { slot } = useNavbar();

    return (
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-md">
            <SidebarToggle />
            <Separator orientation="vertical" className="h-5 data-vertical:self-center" />
            <PageBreadcrumb />
            <div className="ml-auto flex items-center gap-1">
                {slot}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon-sm" onClick={onSearch}>
                            <SearchIcon />
                            <span className="sr-only">{t('shell.navbar.search')}</span>
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                        {t('shell.navbar.search')}
                        <KbdGroup>
                            <Kbd>{MOD_KEY}</Kbd>
                            <Kbd>K</Kbd>
                        </KbdGroup>
                    </TooltipContent>
                </Tooltip>
                <LocaleMenu />
                <ThemeToggle />
            </div>
        </header>
    );
}
