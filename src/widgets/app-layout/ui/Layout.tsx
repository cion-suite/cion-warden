import { Outlet } from 'react-router-dom';

import { SidebarInset, SidebarProvider } from '@/shared/ui/shadcn/sidebar';
import { AppSidebar } from '@/widgets/app-sidebar';
import { Navbar } from '@/widgets/app-navbar';
import { ErrorBoundary } from '@/shared/ui/error-boundary';
import { useStorage } from '@/shared/lib/local-storage';
import { STORAGE } from '@/shared/config/storage-keys';

export function Layout() {
    const [open, setOpen] = useStorage(STORAGE.sidebarOpen);
    return (
        <SidebarProvider open={open} onOpenChange={setOpen}>
            <AppSidebar />
            <SidebarInset className="h-svh overflow-hidden">
                <Navbar />
                <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 py-6">
                    <ErrorBoundary>
                        <Outlet />
                    </ErrorBoundary>
                </main>
            </SidebarInset>
        </SidebarProvider>
    );
}
