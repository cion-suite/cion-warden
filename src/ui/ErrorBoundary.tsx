import type { ReactNode } from 'react';
import { ErrorBoundary as ReactErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { errors, logger } from '@cion-suite/core/renderer';

import { Button } from '@/ui/shadcn/button';
import {
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/ui/shadcn/card';
import { CenteredCard } from '@/ui/CenteredCard';

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
                <pre className="max-h-[min(50vh,320px)] overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
                    {stack ?? errors.explain(error).message}
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
                logger.error('ErrorBoundary', error, info.componentStack);
            }}
        >
            {children}
        </ReactErrorBoundary>
    );
}
