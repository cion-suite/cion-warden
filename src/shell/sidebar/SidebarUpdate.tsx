import { DownloadIcon } from 'lucide-react';

import { Progress } from '@/ui/shadcn/progress';
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/ui/shadcn/sidebar';
import { Spinner } from '@/ui/shadcn/spinner';
import { toast } from '@/ui/toast';
import { useUpdateState } from '@/shell/update';
import { useT } from '@/lib/i18n';

/** Загрузка или установка обновления; иначе пусто. */
export function SidebarUpdate() {
    const t = useT();
    const { state: update } = useUpdateState();

    if (update.kind === 'idle' || update.kind === 'failed') return null;

    if (update.kind === 'available') {
        const label = t('shell.sidebar.update.downloading', { version: update.version });
        return (
            <SidebarMenu>
                <SidebarMenuItem>
                    <SidebarMenuButton tooltip={`${label} - ${update.percent}%`} aria-busy>
                        <Spinner />
                        <span>{label}</span>
                    </SidebarMenuButton>
                    <Progress
                        value={update.percent}
                        aria-label={label}
                        className="mt-1 mb-1 group-data-[collapsible=icon]:hidden"
                    />
                </SidebarMenuItem>
            </SidebarMenu>
        );
    }

    const label = t('shell.sidebar.update.ready', { version: update.version });
    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <SidebarMenuButton
                    variant="outline"
                    tooltip={t('shell.sidebar.update.readyHint')}
                    onClick={() =>
                        void toast.result(window.updater.install(), {
                            error: t('updater.failed'),
                        })
                    }
                >
                    <DownloadIcon />
                    <span>{label}</span>
                </SidebarMenuButton>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}
