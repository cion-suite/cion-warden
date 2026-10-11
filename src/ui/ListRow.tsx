import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/ui/shadcn/item';

interface ListRowProps {
    title: string
    subtitle?: string
    /** Рамка запущенного элемента. */
    active?: boolean
    /** Поверх gap-2 действий: у плотных строк gap-1. */
    actionsClassName?: string
    children: ReactNode
}

/** Строка списка: название слева, действия справа. */
export function ListRow({ title, subtitle, active = false, actionsClassName, children }: ListRowProps) {
    return (
        <Item
            variant="outline"
            className={cn('flex-nowrap justify-between gap-4 bg-card px-4 py-3', active && 'border-primary/30')}
        >
            <ItemContent className="min-w-0 gap-1">
                <ItemTitle className="max-w-full font-semibold">{title}</ItemTitle>
                {subtitle && (
                    <ItemDescription className="line-clamp-1 text-xs">{subtitle}</ItemDescription>
                )}
            </ItemContent>
            <ItemActions className={cn('shrink-0', actionsClassName)}>{children}</ItemActions>
        </Item>
    );
}
