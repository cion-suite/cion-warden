import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useStored, windows } from '@cion-suite/core/renderer';

import { SidebarInset, SidebarProvider } from '@/ui/shadcn/sidebar';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import { AppSidebar } from '@/shell/sidebar';
import { Navbar, NavbarProvider } from '@/shell/navbar';
import { PostUpdateChangelogDialog, useAutoUpdaterCheck } from '@/shell/update';
import { useQuerySync } from '@/lib/hooks/useQuerySync';
import { state } from '@/lib/state';

export function Layout() {
    const sidebarOpen = useStored(state, 'sidebarOpen');
    useAutoUpdaterCheck();
    useQuerySync();

    // Оболочка отрисована: main показывает окно
    // (show: 'content') и закрывает splash.
    useEffect(() => {
        windows.ready();
    }, []);

    return (
        <NavbarProvider>
            <SidebarProvider open={sidebarOpen} onOpenChange={(open) => state.set('sidebarOpen', open)}>
                <AppSidebar />
                <PostUpdateChangelogDialog />
                {/* Страницы сами держат ширину и скролл списков */}
                <SidebarInset className="h-svh overflow-hidden">
                    <Navbar />
                    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
                        <ErrorBoundary>
                            <Outlet />
                        </ErrorBoundary>
                    </div>
                </SidebarInset>
            </SidebarProvider>
        </NavbarProvider>
    );
}
