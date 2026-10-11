import { useState } from 'react';
import { PlusIcon } from 'lucide-react';

import { useT } from '@/lib/i18n';
import { Button } from '@/ui/shadcn/button';
import { Dialog, DialogContent, DialogTitle } from '@/ui/shadcn/dialog';
import { Skeleton } from '@/ui/shadcn/skeleton';
import { toast } from '@/ui/toast';

import { NewSourcePanel } from './NewSourcePanel';
import { NewSourceItem, SourceItem } from './SourceItem';
import { SourceSettings } from './SourceSettings';
import type { SourcesDialogProps } from './types';
import { useInvalidateSources, useSources } from './useSources';

// Radix размонтирует содержимое при закрытии, поэтому
// состояние при каждом открытии начинается заново
function SourcesDialogBody() {
    const t = useT();
    const { sources, loading } = useSources();
    const invalidateSources = useInvalidateSources();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [addingNew, setAddingNew] = useState(false);
    const [newUrl, setNewUrl] = useState('');

    const selectedSource = addingNew ? null : (sources.find((s) => s.id === selectedId) ?? sources[0] ?? null);

    const handleDelete = async (id: string) => {
        const ok = await toast.result(window.sources.remove(id), { error: t('error') });
        if (ok && selectedId === id) setSelectedId(null);
        void invalidateSources();
    };

    const handleAddSource = () => {
        setSelectedId(null);
        setAddingNew(true);
        setNewUrl('');
    };

    const handleNewDone = () => {
        setAddingNew(false);
        setNewUrl('');
    };

    const handleNewSaved = (sourceId: string) => {
        handleNewDone();
        setSelectedId(sourceId);
    };

    return (
        <div className="flex h-[min(520px,calc(100dvh-2rem))]">
            <div className="flex w-[220px] shrink-0 flex-col border-r">
                <div className="border-b px-3 py-2.5 text-sm font-semibold">{t('sources.title')}</div>

                <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
                    {sources.map((source) => (
                        <SourceItem
                            key={source.id}
                            source={source}
                            selected={selectedSource?.id === source.id}
                            onSelect={() => {
                                setAddingNew(false);
                                setSelectedId(source.id);
                            }}
                            onDelete={() => void handleDelete(source.id)}
                        />
                    ))}
                    {loading && <Skeleton className="h-8 w-full" />}
                    {addingNew && <NewSourceItem onCancel={handleNewDone} />}
                </div>

                <div className="border-t p-2">
                    <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleAddSource}>
                        <PlusIcon data-icon="inline-start" />
                        {t('sources.add')}
                    </Button>
                </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col">
                {addingNew ? (
                    <NewSourcePanel
                        url={newUrl}
                        onUrlChange={setNewUrl}
                        onSaved={handleNewSaved}
                        onCancel={handleNewDone}
                    />
                ) : selectedSource ? (
                    <SourceSettings
                        key={`${selectedSource.id}:${selectedSource.tokenMask ?? ''}`}
                        source={selectedSource}
                    />
                ) : loading ? (
                    <div className="flex flex-col gap-3 p-3">
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                    </div>
                ) : (
                    <div className="flex flex-1 items-center justify-center">
                        <p className="text-sm text-muted-foreground">{t('sources.selectSource')}</p>
                    </div>
                )}
            </div>
        </div>
    );
}

export function SourcesDialog({ open, onOpenChange }: SourcesDialogProps) {
    const t = useT();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-3xl">
                <DialogTitle className="sr-only">{t('sources.title')}</DialogTitle>
                <SourcesDialogBody />
            </DialogContent>
        </Dialog>
    );
}
