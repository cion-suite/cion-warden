import { useState } from 'react';
import { DownloadIcon } from 'lucide-react';
import type { Bind } from '@shared/types';

import { Button } from '@/ui/shadcn/button';
import { ListPanel } from '@/ui/ListPanel';
import { useT } from '@/lib/i18n';
import { useSetNavbarCrumb } from '@/lib/navbar';
import { SourcesButton } from '@/entities/source/manage';
import { useSourcesSync } from '@/entities/source/sync';
import { PresetForm } from '../form/PresetForm';
import { BindCard } from './BindCard';
import { useBindActions } from './useBindActions';
import { useBinds } from './useBinds';

const bindKey = (b: Bind) => `${b.sourceId}/${b.id}`;

export default function BindsPage() {
    const t = useT();
    const [selectedKey, setSelectedKey] = useState<string | null>(null);

    const { binds, loading, error, refresh } = useBinds();
    const actions = useBindActions();
    const { syncing, sync } = useSourcesSync();

    const downloaded = binds.filter((b) => b.isDownloaded);
    const canBulkDownload = binds.some((b) => !b.isDownloaded);

    // Режим A: один пресет и он скачан - сразу форма. Иначе
    // сетка с тулбаром нужна, пока есть что скачать.
    const soloBind = selectedKey === null && binds.length === 1 && downloaded.length === 1 ? downloaded[0] : undefined;
    const activeBind = selectedKey === null ? soloBind : binds.find((b) => bindKey(b) === selectedKey);

    useSetNavbarCrumb(
        activeBind
            ? { label: activeBind.name, onBack: selectedKey !== null ? () => setSelectedKey(null) : undefined }
            : null,
    );

    if (activeBind) {
        return (
            <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col">
                <PresetForm key={bindKey(activeBind)} sourceId={activeBind.sourceId} presetId={activeBind.id} />
            </div>
        );
    }

    return (
        <ListPanel
            layout="grid"
            className="max-w-5xl"
            toolbar={
                <>
                    <SourcesButton />
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!canBulkDownload || actions.bulkBusy}
                        onClick={() => void actions.syncAll()}
                    >
                        <DownloadIcon data-icon="inline-start" />
                        {t('binds.downloadAll')}
                    </Button>
                </>
            }
            onRefresh={() => void sync()}
            refreshing={syncing}
            loading={loading}
            error={error}
            onRetry={refresh}
            empty={{ title: t('binds.title'), description: t('binds.empty') }}
            count={binds.length}
        >
            {binds.map((b) => (
                <BindCard
                    key={bindKey(b)}
                    bind={b}
                    busy={actions.isBusy(b)}
                    onOpen={(bind) => setSelectedKey(bindKey(bind))}
                    onInstall={(bind) => void actions.install(bind)}
                    onDelete={(bind) => void actions.remove(bind)}
                    onOpenFolder={(bind) => void actions.openFolder(bind)}
                />
            ))}
        </ListPanel>
    );
}
