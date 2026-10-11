import { DownloadIcon } from 'lucide-react';

import { SourcesButton } from '@/entities/source/manage';
import { useSourcesSync } from '@/entities/source/sync';
import { useT } from '@/lib/i18n';
import { ListPanel } from '@/ui/ListPanel';
import { Button } from '@/ui/shadcn/button';
import { useNavbarSearch } from '@/ui/useNavbarSearch';
import { LibraryRow } from './LibraryRow';
import { useLibActions } from './useLibActions';
import { useLibs } from './useLibs';

export default function LibrariesPage() {
    const t = useT();
    const q = useNavbarSearch(t('libs.search'));
    const { libs, loading, error, refresh } = useLibs();
    const { syncing, sync } = useSourcesSync();
    const actions = useLibActions();

    const filtered = q ? libs.filter((l) => l.name.toLowerCase().includes(q)) : libs;
    const canBulkInstall = libs.some((l) => !l.isDownloaded);

    return (
        <ListPanel
            toolbar={
                <>
                    <SourcesButton />
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!canBulkInstall || actions.bulkBusy}
                        onClick={() => void actions.syncAll()}
                    >
                        <DownloadIcon data-icon="inline-start" />
                        {t('libs.downloadAll')}
                    </Button>
                </>
            }
            onRefresh={() => void sync()}
            refreshing={syncing}
            loading={loading}
            error={error}
            onRetry={refresh}
            empty={{ title: t('libs.title'), description: t('libs.empty') }}
            count={filtered.length}
        >
            {filtered.map((lib) => (
                <LibraryRow
                    key={`${lib.sourceId}/${lib.id}`}
                    lib={lib}
                    busy={actions.isBusy(lib)}
                    onInstall={(l) => void actions.install(l)}
                    onRemove={(l) => void actions.remove(l)}
                    onOpenFolder={(l) => void actions.openFolder(l)}
                    onOpenWeb={(l) => void actions.openWeb(l)}
                />
            ))}
        </ListPanel>
    );
}
