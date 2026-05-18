import type { ReactNode } from 'react';
import { ErrorBoundary as ReactErrorBoundary, type FallbackProps } from 'react-error-boundary';

import { Button } from '@/shared/ui/shadcn/button';
import {
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/shared/ui/shadcn/card';
import { CenteredCard } from '@/shared/ui/centered-card';
import { getErrorMessage } from '@/shared/lib/utils';

function Fallback({ error, resetErrorBoundary }: FallbackProps) {
    const stack = error instanceof Error ? error.stack : undefined;
    return (
        <CenteredCard className="max-w-lg">
            <CardHeader>
                <CardTitle>Something went wrong</CardTitle>
                <CardDescription>
                    Unexpected error in renderer. See details below.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <pre className="overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
                    {stack ?? getErrorMessage(error)}
                </pre>
            </CardContent>
            <CardFooter className="border-t justify-end gap-2">
                <Button variant="outline" onClick={() => window.location.reload()}>
                    Reload
                </Button>
                <Button onClick={resetErrorBoundary}>Try again</Button>
            </CardFooter>
        </CenteredCard>
    );
}

export function ErrorBoundary({ children }: { children: ReactNode }) {
    return (
        <ReactErrorBoundary
            FallbackComponent={Fallback}
            onError={(error, info) => {
                console.error('[ErrorBoundary]', error, info);
                void window.app?.reportError({
                    message: getErrorMessage(error),
                    stack: error instanceof Error ? error.stack : undefined,
                    componentStack: info.componentStack ?? undefined,
                });
            }}
        >
            {children}
        </ReactErrorBoundary>
    );
}
