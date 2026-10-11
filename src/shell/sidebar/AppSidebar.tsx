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
} from '@/ui/shadcn/sidebar';
import { useT } from '@/lib/i18n';
import { SECTIONS, SIDEBAR_GROUPS, type SectionGroup } from './sections';
import { SidebarUpdate } from './SidebarUpdate';
import { usePersistLastRoute } from './usePersistLastRoute';

function SectionMenu({ group }: { group: SectionGroup }) {
    const t = useT();
    const { pathname } = useLocation();

    return (
        <SidebarMenu>
            {SECTIONS.filter((section) => section.group === group).map((section) => (
                <SidebarMenuItem key={section.path}>
                    <SidebarMenuButton
                        asChild
                        isActive={pathname === section.path}
                        tooltip={t(section.i18nKey)}
                    >
                        <Link to={section.path}>
                            <section.icon />
                            <span>{t(section.i18nKey)}</span>
                        </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            ))}
        </SidebarMenu>
    );
}

export function AppSidebar() {
    const t = useT();
    usePersistLastRoute();

    return (
        <Sidebar collapsible="icon">
            <SidebarContent>
                {SIDEBAR_GROUPS.map((group) => (
                    <SidebarGroup key={group}>
                        <SidebarGroupLabel className="group-data-[collapsible=icon]:pointer-events-none">
                            {t(`nav.section.${group}`)}
                        </SidebarGroupLabel>
                        <SectionMenu group={group} />
                    </SidebarGroup>
                ))}
            </SidebarContent>
            <SidebarFooter>
                <SidebarUpdate />
                <SectionMenu group="footer" />
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    );
}
