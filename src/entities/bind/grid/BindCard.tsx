import { useRef, useState } from 'react';
import { DownloadIcon, FolderOpenIcon, KeyRoundIcon, MoreHorizontalIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';

import { Button } from '@/ui/shadcn/button';
import { Card, CardContent } from '@/ui/shadcn/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/ui/shadcn/dropdown-menu';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { BindCardProps } from './types';

export function BindCard({ bind, busy, onOpen, onInstall, onDelete, onOpenFolder }: BindCardProps) {
    const t = useT();
    const [deleteOpen, setDeleteOpen] = useState(false);
    // Click после закрытия меню иначе откроет форму.
    const suppressClickRef = useRef(false);

    const isInteractive = bind.isDownloaded && !busy;

    return (
        <>
            <Card
                className={cn(
                    'group relative flex flex-col gap-1 p-3 transition-colors',
                    isInteractive && 'cursor-pointer hover:bg-accent/40',
                )}
                onClick={() => {
                    if (suppressClickRef.current) {
                        suppressClickRef.current = false;
                        return;
                    }
                    if (isInteractive) onOpen(bind);
                }}
            >
                <CardContent className="flex flex-col gap-1 p-0">
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                            <KeyRoundIcon className="size-4 shrink-0 text-muted-foreground" />
                            <p className="truncate text-sm font-semibold">{bind.name}</p>
                        </div>
                        {bind.isDownloaded ? (
                            <DropdownMenu
                                onOpenChange={(open) => {
                                    if (!open) suppressClickRef.current = true;
                                }}
                            >
                                <DropdownMenuTrigger
                                    render={
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            onClick={(e) => e.stopPropagation()}
                                            title={bind.hasUpdate ? t('binds.update') : undefined}
                                            className="relative"
                                        />
                                    }
                                >
                                    <MoreHorizontalIcon />
                                    {bind.hasUpdate && (
                                        <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-destructive" />
                                    )}
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                    {bind.hasUpdate && (
                                        <DropdownMenuItem onClick={() => onInstall(bind)} disabled={busy}>
                                            <RefreshCwIcon data-icon="inline-start" />
                                            {t('binds.update')}
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem onClick={() => onOpenFolder(bind)}>
                                        <FolderOpenIcon data-icon="inline-start" />
                                        {t('binds.openLocal')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                                        <Trash2Icon data-icon="inline-start" />
                                        {t('binds.deleteLocal')}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : (
                            <Button
                                variant="default"
                                size="icon-sm"
                                disabled={busy}
                                title={t('binds.download')}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onInstall(bind);
                                }}
                            >
                                <DownloadIcon />
                            </Button>
                        )}
                    </div>

                    <p className="truncate text-xs text-muted-foreground">{bind.sourceName}</p>
                </CardContent>
            </Card>

            <ConfirmDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title={t('binds.deleteLocal')}
                description={t('binds.deleteConfirm', { name: bind.name })}
                onConfirm={() => {
                    setDeleteOpen(false);
                    onDelete(bind);
                }}
            />
        </>
    );
}
