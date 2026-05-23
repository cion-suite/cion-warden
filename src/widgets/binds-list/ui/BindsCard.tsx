import { useRef, useState } from 'react';
import { Download, FolderOpen, KeyRound, MoreHorizontal, RefreshCw, Trash2 } from 'lucide-react';

import { useT } from '@/shared/i18n';
import { Button } from '@/shared/ui/shadcn/button';
import { Card, CardContent } from '@/shared/ui/shadcn/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/shared/ui/shadcn/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/shared/ui/shadcn/dropdown-menu';
import type { RemotePresetMeta } from '@shared/types/binds';

interface BindsCardProps {
    preset: RemotePresetMeta;
    busy: boolean;
    onOpen: (preset: RemotePresetMeta) => void;
    onDownload: (preset: RemotePresetMeta) => void;
    onDelete: (preset: RemotePresetMeta) => void;
    onOpenLocal: (preset: RemotePresetMeta) => void;
}

export function BindsCard({
    preset,
    busy,
    onOpen,
    onDownload,
    onDelete,
    onOpenLocal,
}: BindsCardProps) {
    const t = useT();
    const [deleteOpen, setDeleteOpen] = useState(false);
    // Radix dismisses the dropdown on outside pointerdown; the native click
    // that follows still bubbles to the Card and would trigger onOpen.
    // suppressClickRef latches on dropdown close so the next card click is
    // ignored.
    const suppressClickRef = useRef(false);

    const isInteractive = preset.isDownloaded && !busy;

    return (
        <>
            <Card
                className={
                    'group relative flex flex-col gap-1 p-3 transition-colors ' +
                    (isInteractive ? 'cursor-pointer hover:bg-accent/40' : '')
                }
                onClick={() => {
                    if (suppressClickRef.current) {
                        suppressClickRef.current = false;
                        return;
                    }
                    if (isInteractive) onOpen(preset);
                }}
            >
                <CardContent className="flex flex-col gap-1 p-0">
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                            <KeyRound className="size-4 shrink-0 text-muted-foreground" />
                            <p className="truncate text-sm font-semibold">{preset.name}</p>
                        </div>
                        {preset.isDownloaded ? (
                            <DropdownMenu
                                onOpenChange={(open) => {
                                    if (!open) suppressClickRef.current = true;
                                }}
                            >
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        onClick={(e) => e.stopPropagation()}
                                        title={
                                            preset.hasUpdate ? t('binds.update') : undefined
                                        }
                                        className="relative"
                                    >
                                        <MoreHorizontal />
                                        {preset.hasUpdate && (
                                            <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-destructive" />
                                        )}
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    align="end"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {preset.hasUpdate && (
                                        <DropdownMenuItem
                                            onClick={() => onDownload(preset)}
                                            disabled={busy}
                                        >
                                            <RefreshCw data-icon="inline-start" />
                                            {t('binds.update')}
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem onClick={() => onOpenLocal(preset)}>
                                        <FolderOpen data-icon="inline-start" />
                                        {t('binds.openLocal')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        variant="destructive"
                                        onClick={() => setDeleteOpen(true)}
                                    >
                                        <Trash2 data-icon="inline-start" />
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
                                    onDownload(preset);
                                }}
                            >
                                <Download />
                            </Button>
                        )}
                    </div>

                    <p className="truncate text-xs text-muted-foreground">{preset.sourceName}</p>
                </CardContent>
            </Card>

            {deleteOpen && (
                <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{t('binds.deleteLocal')}</DialogTitle>
                            <DialogDescription>
                                {t('binds.deleteConfirm', { name: preset.name })}
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
                                {t('cancel')}
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={() => {
                                    setDeleteOpen(false);
                                    onDelete(preset);
                                }}
                            >
                                {t('confirm')}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </>
    );
}
