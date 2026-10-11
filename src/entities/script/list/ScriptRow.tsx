import { useState } from 'react';
import {
    FolderOpenIcon,
    MoreHorizontalIcon,
    PlayIcon,
    Settings2Icon,
    SquareIcon,
    Trash2Icon,
} from 'lucide-react';

import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { ListRow } from '@/ui/ListRow';
import { Button } from '@/ui/shadcn/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/ui/shadcn/dropdown-menu';
import { Spinner } from '@/ui/shadcn/spinner';
import { toast } from '@/ui/toast';
import { useInvalidate } from '@/lib/hooks/useInvalidate';
import { useT } from '@/lib/i18n';
import { ScriptConfigDialog } from '../values/ScriptConfigDialog';
import type { ScriptRowProps } from './types';

function formatModifiedAt(modifiedAt: number): string {
    const d = new Date(modifiedAt);
    const date = d.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' });
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return `${date} ${time}`;
}

export function ScriptRow({ script, onRun, checking }: ScriptRowProps) {
    const t = useT();
    const invalidate = useInvalidate();
    const [configOpen, setConfigOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);

    const running = script.status === 'running';
    const hasConfig = Boolean(script.configPath);

    const runOrStop = async () => {
        if (checking) return;
        if (running) {
            await toast.result(window.scripts.processes.remove(script.id), { error: t('error') });
        } else {
            await onRun(script.id);
        }
    };

    const deleteScript = async () => {
        const ok = await toast.result(window.scripts.delete(script.filePath), { error: t('error') });
        if (!ok) return;
        setDeleteOpen(false);
        void invalidate('scripts:list', 'catalog:scripts:list');
    };

    const subtitle = script.modifiedAt
        ? `${t('scripts.modified')}: ${formatModifiedAt(script.modifiedAt)}`
        : undefined;

    return (
        <>
            <ListRow title={script.name} subtitle={subtitle} active={running} actionsClassName="gap-1">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                            <MoreHorizontalIcon />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                            <DropdownMenuItem
                                onClick={() =>
                                    void toast.result(window.scripts.folder.open(script.filePath), {
                                        error: t('error'),
                                    })
                                }
                            >
                                <FolderOpenIcon data-icon="inline-start" />
                                {t('scripts.openInExplorer')}
                            </DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                                <Trash2Icon data-icon="inline-start" />
                                {t('scripts.delete')}
                            </DropdownMenuItem>
                        </DropdownMenuGroup>
                    </DropdownMenuContent>
                </DropdownMenu>

                <Button variant="ghost" size="icon-sm" disabled={!hasConfig} onClick={() => setConfigOpen(true)}>
                    <Settings2Icon />
                </Button>

                <Button
                    variant={running ? 'secondary' : 'default'}
                    size="sm"
                    disabled={checking}
                    onClick={() => void runOrStop()}
                >
                    {checking ? (
                        <Spinner data-icon="inline-start" />
                    ) : running ? (
                        <SquareIcon data-icon="inline-start" />
                    ) : (
                        <PlayIcon data-icon="inline-start" />
                    )}
                    {checking ? t('scripts.deps.checking') : running ? t('scripts.stop') : t('scripts.run')}
                </Button>
            </ListRow>

            {hasConfig && configOpen && (
                <ScriptConfigDialog script={script} open={configOpen} onOpenChange={setConfigOpen} />
            )}

            <ConfirmDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title={t('scripts.delete')}
                description={t('scripts.deleteConfirm', { name: script.name })}
                onConfirm={() => void deleteScript()}
            />
        </>
    );
}
