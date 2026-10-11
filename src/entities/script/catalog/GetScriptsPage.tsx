import { ListPanel } from '@/ui/ListPanel';
import { useNavbarSearch } from '@/ui/useNavbarSearch';
import { useT } from '@/lib/i18n';
import { SourcesButton } from '@/entities/source/manage';
import { useSourcesSync } from '@/entities/source/sync';
import { CatalogScriptRow } from './CatalogScriptRow';
import { useCatalogScripts } from './useCatalogScripts';
import { useInstallScript } from './useInstallScript';

export default function GetScriptsPage() {
    const t = useT();
    const query = useNavbarSearch(t('scripts.search'));
    const { scripts, loading, error, refresh } = useCatalogScripts();
    const { syncing, sync } = useSourcesSync();
    const { downloadingId, install } = useInstallScript();

    const filtered = query ? scripts.filter((s) => s.name.toLowerCase().includes(query)) : scripts;

    return (
        <ListPanel
            toolbar={<SourcesButton />}
            onRefresh={() => void sync()}
            refreshing={syncing}
            onRetry={refresh}
            loading={loading}
            error={error}
            empty={{ title: t('getScripts.title'), description: t('getScripts.empty') }}
            count={filtered.length}
        >
            {filtered.map((script) => (
                <CatalogScriptRow
                    key={script.id}
                    script={script}
                    downloading={downloadingId === script.id}
                    onInstall={(s) => void install(s)}
                />
            ))}
        </ListPanel>
    );
}
