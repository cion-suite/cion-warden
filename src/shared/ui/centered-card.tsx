import type { ReactNode } from 'react';

import { Card } from '@/shared/ui/shadcn/card';
import { cn } from '@/shared/lib/utils';

export function CenteredCard({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <main className="flex min-h-screen items-center justify-center p-2">
            <Card className={cn('w-full', className)}>{children}</Card>
        </main>
    );
}
