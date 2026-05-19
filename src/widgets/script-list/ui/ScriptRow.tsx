import { useState } from 'react';
import { FolderOpen, MoreHorizontal, Play, Settings2, Square, Trash2 } from 'lucide-react';

import { useT } from '@/shared/i18n';
import { toast } from '@/shared/lib/toast';
import { cn } from '@/shared/lib/utils';
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
import { ScriptConfigDialog } from '@/features/script-config';
import type { ScriptMeta } from '@shared/types/scripts';

interface ScriptRowProps {
    script: ScriptMeta;
    onRun: (id: string) => Promise<void>;
    onStop: (id: string) => Promise<void>;
    onDelete: () => void;
}

export function ScriptRow({ script, onRun, onStop, onDelete }: ScriptRowProps) {
    const t = useT();
    const [configOpen, setConfigOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);

    const isRunning = script.status === 'running';
    const hasConfig = !!script.configPath;

    const handleRunStop = async () => {
        try {
            if (isRunning) await onStop(script.id);
            else await onRun(script.id);
        } catch {
            toast.error(t('error'));
        }
    };

    const handleDeleteConfirm = async () => {
        try {
            await window.app?.scripts.delete(script.filePath);
            setDeleteOpen(false);
            onDelete();
        } catch {
            toast.error(t('error'));
        }
    };

    const metaLine = (() => {
        if (script.modifiedAt) {
            const d = new Date(script.modifiedAt);
            const date = d.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' });
            const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
            return `${t('scripts.modified')}: ${date} ${time}`;
        }
        return '';
    })();

    return (
        <>
            <div
                className={cn(
                    'flex items-center justify-between gap-4 rounded-lg border bg-card px-4 py-3',
                    isRunning && 'border-primary/30',
                )}
            >
                <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold leading-none">{script.name}</p>
                    {metaLine && (
                        <p className="mt-1 truncate text-xs text-muted-foreground">{metaLine}</p>
                    )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm">
                                <MoreHorizontal />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem
                                onClick={() =>
                                    void window.app?.scripts.openInExplorer(script.filePath)
                                }
                            >
                                <FolderOpen data-icon="inline-start" />
                                {t('scripts.openInExplorer')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setDeleteOpen(true)}
                            >
                                <Trash2 data-icon="inline-start" />
                                {t('scripts.delete')}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={!hasConfig}
                        onClick={() => setConfigOpen(true)}
                    >
                        <Settings2 />
                    </Button>

                    <Button
                        variant={isRunning ? 'secondary' : 'default'}
                        size="sm"
                        onClick={() => void handleRunStop()}
                    >
                        {isRunning ? (
                            <Square data-icon="inline-start" />
                        ) : (
                            <Play data-icon="inline-start" />
                        )}
                        {isRunning ? t('scripts.stop') : t('scripts.run')}
                    </Button>
                </div>
            </div>

            {hasConfig && (
                <ScriptConfigDialog
                    script={script}
                    open={configOpen}
                    onOpenChange={setConfigOpen}
                />
            )}

            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('scripts.delete')}</DialogTitle>
                        <DialogDescription>
                            {t('scripts.deleteConfirm', { name: script.name })}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
                            {t('cancel')}
                        </Button>
                        <Button variant="destructive" onClick={() => void handleDeleteConfirm()}>
                            {t('confirm')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
