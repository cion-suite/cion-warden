import { LockIcon, Trash2Icon } from 'lucide-react';

import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/ui/shadcn/button';

import type { NewSourceItemProps, SourceItemProps } from './types';

export function SourceItem({ source, selected, onSelect, onDelete }: SourceItemProps) {
    const t = useT();
    const title = source.name.split('/').pop() ?? source.name;

    return (
        <div
            className={cn(
                'group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors',
                selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
            )}
            onClick={onSelect}
        >
            <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{title}</span>
                <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    {source.isPrivate && <LockIcon className="size-3" />}
                    <span>
                        GIT
                        {source.isPrivate ? ` · ${t('sources.private').toLowerCase()}` : ''}
                    </span>
                </span>
            </div>
            <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0 opacity-0 group-hover:opacity-100"
                onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                }}
            >
                <Trash2Icon />
            </Button>
        </div>
    );
}

export function NewSourceItem({ onCancel }: NewSourceItemProps) {
    const t = useT();

    return (
        <div className="group flex items-center gap-2 rounded-md bg-accent px-2 py-1.5 text-accent-foreground">
            <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium italic text-muted-foreground">
                    {t('sources.newShort')}
                </span>
                <span className="truncate text-xs text-muted-foreground">GIT</span>
            </div>
            <Button variant="ghost" size="icon-sm" className="shrink-0" onClick={onCancel}>
                <Trash2Icon />
            </Button>
        </div>
    );
}
