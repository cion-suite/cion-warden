import { ListPanel } from '@/ui/ListPanel';
import { Button } from '@/ui/shadcn/button';
import { toast } from '@/ui/toast';
import { useNavbarSearch } from '@/ui/useNavbarSearch';
import { useInvalidate } from '@/lib/hooks/useInvalidate';
import { useT } from '@/lib/i18n';
import { MissingLibsDialog } from '../deps/MissingLibsDialog';
import { useRunWithDeps } from '../deps/useRunWithDeps';
import { ScriptRow } from './ScriptRow';
import { useScripts } from './useScripts';

export default function ScriptsPage() {
    const t = useT();
    const invalidate = useInvalidate();
    const query = useNavbarSearch(t('scripts.search'));
    const { scripts, loading, error, running, refresh } = useScripts();
    const { run, state, checkingId, onConfirm, onCancel } = useRunWithDeps();

    const filtered = query ? scripts.filter((s) => s.name.toLowerCase().includes(query)) : scripts;

    const stopAll = async () => {
        await toast.result(window.scripts.processes.clear(), { error: t('error') });
        void invalidate('scripts:processes:get');
    };

    return (
        <>
            <ListPanel
                toolbar={
                    <Button variant="outline" size="sm" disabled={!running} onClick={() => void stopAll()}>
                        {t('scripts.stopAll')}
                    </Button>
                }
                onRefresh={refresh}
                onRetry={refresh}
                loading={loading}
                error={error}
                empty={{ title: t('scripts.title'), description: t('scripts.empty') }}
                count={filtered.length}
            >
                {filtered.map((script) => (
                    <ScriptRow
                        key={script.id}
                        script={script}
                        onRun={run}
                        checking={checkingId === script.id}
                    />
                ))}
            </ListPanel>
            <MissingLibsDialog state={state} onConfirm={onConfirm} onCancel={onCancel} />
        </>
    );
}
