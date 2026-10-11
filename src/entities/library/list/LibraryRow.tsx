import { useState } from 'react';
import {
    CheckIcon,
    DownloadIcon,
    ExternalLinkIcon,
    FolderOpenIcon,
    MoreHorizontalIcon,
    Trash2Icon,
} from 'lucide-react';

import { useT } from '@/lib/i18n';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { ListRow } from '@/ui/ListRow';
import { Badge } from '@/ui/shadcn/badge';
import { Button } from '@/ui/shadcn/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/ui/shadcn/dropdown-menu';
import type { LibraryRowProps } from './types';

export function LibraryRow({ lib, busy, onInstall, onRemove, onOpenFolder, onOpenWeb }: LibraryRowProps) {
    const t = useT();
    const [deleteOpen, setDeleteOpen] = useState(false);

    return (
        <>
            <ListRow title={lib.name} subtitle={lib.sourceName}>
                {lib.hasUpdate && (
                    <Badge variant="destructive">{t('getScripts.updateAvailable')}</Badge>
                )}

                {lib.isDownloaded && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm">
                                <MoreHorizontalIcon />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                                <DropdownMenuItem onClick={() => onOpenFolder(lib)}>
                                    <FolderOpenIcon data-icon="inline-start" />
                                    {t('libs.openLocal')}
                                </DropdownMenuItem>
                                {lib.webUrl && (
                                    <DropdownMenuItem onClick={() => onOpenWeb(lib)}>
                                        <ExternalLinkIcon data-icon="inline-start" />
                                        {t('libs.openWeb')}
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() => setDeleteOpen(true)}
                                >
                                    <Trash2Icon data-icon="inline-start" />
                                    {t('libs.deleteLocal')}
                                </DropdownMenuItem>
                            </DropdownMenuGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}

                {!lib.isDownloaded ? (
                    <Button size="sm" disabled={busy} onClick={() => onInstall(lib)}>
                        <DownloadIcon data-icon="inline-start" />
                        {t('libs.download')}
                    </Button>
                ) : lib.hasUpdate ? (
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => onInstall(lib)}>
                        <DownloadIcon data-icon="inline-start" />
                        {t('libs.update')}
                    </Button>
                ) : (
                    <Button variant="ghost" size="sm" disabled>
                        <CheckIcon data-icon="inline-start" />
                        {t('libs.latest')}
                    </Button>
                )}
            </ListRow>

            {deleteOpen && (
                <ConfirmDialog
                    open={deleteOpen}
                    onOpenChange={setDeleteOpen}
                    title={t('libs.deleteLocal')}
                    description={t('libs.deleteConfirm', { name: lib.name })}
                    onConfirm={() => {
                        setDeleteOpen(false);
                        onRemove(lib);
                    }}
                />
            )}
        </>
    );
}
