import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router-dom';

import { ErrorBoundary } from '@/ui/ErrorBoundary';
import { TooltipProvider } from '@/ui/shadcn/tooltip';
import { Toaster } from '@/ui/toast';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
        },
    },
});

export const AppProvider = ({ children }: { children: ReactNode }) => (
    <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
            <TooltipProvider>
                <HashRouter>
                    {children}
                    <Toaster position="bottom-right" richColors />
                </HashRouter>
            </TooltipProvider>
        </QueryClientProvider>
    </ErrorBoundary>
);
