import type { ReactNode } from 'react';
import { HashRouter } from 'react-router-dom';

import { TooltipProvider } from '@/shared/ui/shadcn/tooltip';

import { ErrorBoundary } from '@/shared/ui/error-boundary';
import { Toaster } from '@/shared/ui/shadcn/sonner';

import { I18nProvider } from './I18nProvider';
import { ThemeProvider } from './ThemeProvider';
import { QueryProvider } from './QueryProvider';

export function AppProvider({ children }: { children: ReactNode }) {
    return (
        <ErrorBoundary>
            <I18nProvider>
                <ThemeProvider>
                    <QueryProvider>
                        <TooltipProvider>
                            <HashRouter>
                                {children}
                                <Toaster position="bottom-right" richColors />
                            </HashRouter>
                        </TooltipProvider>
                    </QueryProvider>
                </ThemeProvider>
            </I18nProvider>
        </ErrorBoundary>
    );
}
