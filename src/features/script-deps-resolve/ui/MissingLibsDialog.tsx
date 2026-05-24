import { AlertTriangle, Download, FileText, Package } from 'lucide-react';

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
import { Progress } from '@/shared/ui/shadcn/progress';
import { ScrollArea } from '@/shared/ui/shadcn/scroll-area';

import type { ResolveDialogState } from '../model/use-run-with-deps';

interface MissingLibsDialogProps {
    state: ResolveDialogState;
    onConfirm: () => void;
    onCancel: () => void;
}

export function MissingLibsDialog({ state, onConfirm, onCancel }: MissingLibsDialogProps) {
    const t = useT();
    const open = state.kind !== 'closed';

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('scripts.deps.title')}</DialogTitle>
                    <DialogDescription>{t('scripts.deps.description')}</DialogDescription>
                </DialogHeader>

                {state.kind === 'confirm' && (
                    <div className="flex flex-col gap-3">
                        <ScrollArea className="max-h-[40vh]">
                            <ul className="flex flex-col divide-y divide-border">
                                {state.missing.map((item) => {
                                    const isLib = item.kind === 'lib';
                                    const Icon = isLib ? Package : FileText;
                                    const key = isLib ? item.libId : item.presetId;
                                    return (
                                        <li
                                            key={key}
                                            className="flex items-center gap-2 py-2 text-sm"
                                        >
                                            <Icon
                                                className="size-4 shrink-0 text-muted-foreground"
                                                aria-hidden
                                            />
                                            <span className="flex-1 truncate">{item.name}</span>
                                            <Badge variant="secondary" className="text-[10px]">
                                                {t(isLib ? 'scripts.deps.kindLib' : 'scripts.deps.kindPreset')}
                                            </Badge>
                                        </li>
                                    );
                                })}
                            </ul>
                        </ScrollArea>

                        {state.unknown.length > 0 && (
                            <div className="flex flex-col gap-1.5 rounded-md border border-dashed bg-muted/30 p-3">
                                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                    <AlertTriangle className="size-3.5" aria-hidden />
                                    {t('scripts.deps.unknownHeader')}
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {state.unknown.map((u) => (
                                        <Badge key={u} variant="secondary" className="font-mono text-xs">
                                            {u}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {state.kind === 'downloading' && (
                    <div className="flex flex-col gap-3 py-2">
                        <Progress value={(state.done / Math.max(state.total, 1)) * 100} />
                        <p className="truncate text-xs text-muted-foreground">
                            {state.currentName
                                ? t('scripts.deps.downloadingNamed', {
                                      done: state.done,
                                      total: state.total,
                                      name: state.currentName,
                                  })
                                : t('scripts.deps.downloading', {
                                      done: state.done,
                                      total: state.total,
                                  })}
                        </p>
                    </div>
                )}

                <DialogFooter>
                    <Button
                        variant="ghost"
                        onClick={onCancel}
                        disabled={state.kind === 'downloading'}
                    >
                        {t('cancel')}
                    </Button>
                    <Button
                        onClick={() => void onConfirm()}
                        disabled={state.kind !== 'confirm'}
                    >
                        <Download data-icon="inline-start" />
                        {t('scripts.deps.downloadAndRun')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
