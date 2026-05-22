import { useState } from 'react';
import { Check, Download, ExternalLink, FolderOpen, MoreHorizontal, Trash2 } from 'lucide-react';

import { useT } from '@/shared/i18n';
import { Badge } from '@/shared/ui/shadcn/badge';
import { Button } from '@/shared/ui/shadcn/button';
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
import type { RemoteLibraryMeta } from '@shared/types/libs';

interface RemoteLibraryRowProps {
    lib: RemoteLibraryMeta;
    busy: boolean;
    onDownload: (lib: RemoteLibraryMeta) => void;
    onDelete: (lib: RemoteLibraryMeta) => void;
    onOpenLocal: (lib: RemoteLibraryMeta) => void;
    onOpenWeb: (lib: RemoteLibraryMeta) => void;
}

export function RemoteLibraryRow({
    lib,
    busy,
    onDownload,
    onDelete,
    onOpenLocal,
    onOpenWeb,
}: RemoteLibraryRowProps) {
    const t = useT();
    const [deleteOpen, setDeleteOpen] = useState(false);

    return (
        <>
            <div className="flex items-center justify-between gap-4 rounded-lg border bg-card px-4 py-3">
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold leading-none">{lib.name}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{lib.sourceName}</p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    {lib.hasUpdate && (
                        <Badge variant="destructive" className="text-xs">
                            {t('getScripts.updateAvailable')}
                        </Badge>
                    )}

                    {lib.isDownloaded && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-sm">
                                    <MoreHorizontal />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => onOpenLocal(lib)}>
                                    <FolderOpen data-icon="inline-start" />
                                    {t('libs.openLocal')}
                                </DropdownMenuItem>
                                {lib.webUrl && (
                                    <DropdownMenuItem onClick={() => onOpenWeb(lib)}>
                                        <ExternalLink data-icon="inline-start" />
                                        {t('libs.openWeb')}
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() => setDeleteOpen(true)}
                                >
                                    <Trash2 data-icon="inline-start" />
                                    {t('libs.deleteLocal')}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}

                    {!lib.isDownloaded ? (
                        <Button size="sm" disabled={busy} onClick={() => onDownload(lib)}>
                            <Download data-icon="inline-start" />
                            {t('libs.download')}
                        </Button>
                    ) : lib.hasUpdate ? (
                        <Button variant="outline" size="sm" disabled={busy} onClick={() => onDownload(lib)}>
                            <Download data-icon="inline-start" />
                            {t('libs.update')}
                        </Button>
                    ) : (
                        <Button variant="ghost" size="sm" disabled>
                            <Check data-icon="inline-start" />
                            {t('libs.latest')}
                        </Button>
                    )}
                </div>
            </div>

            {deleteOpen && (
                <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{t('libs.deleteLocal')}</DialogTitle>
                            <DialogDescription>
                                {t('libs.deleteConfirm', { name: lib.name })}
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
                                    onDelete(lib);
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
