import { Link, useLocation } from 'react-router-dom';

import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarRail,
} from '@/shared/ui/shadcn/sidebar';
import { NAV_BY_SECTION } from '@/shared/config/nav';
import type { NavItem } from '@/shared/types/nav';
import { useT } from '@/shared/i18n';

function NavMenu({ items }: { items: readonly NavItem[] }) {
    const t = useT();
    const { pathname } = useLocation();

    return (
        <SidebarMenu>
            {items.map((item) => (
                <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                        asChild
                        isActive={pathname === item.path}
                        tooltip={t(item.i18nKey)}
                    >
                        <Link to={item.path}>
                            <item.icon />
                            <span>{t(item.i18nKey)}</span>
                        </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            ))}
        </SidebarMenu>
    );
}

export function AppSidebar() {
    const t = useT();

    return (
        <Sidebar collapsible="icon">
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>{t('nav.section.main')}</SidebarGroupLabel>
                    <NavMenu items={NAV_BY_SECTION.main} />
                </SidebarGroup>
            </SidebarContent>
            <SidebarFooter>
                <NavMenu items={NAV_BY_SECTION.footer} />
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    );
}
