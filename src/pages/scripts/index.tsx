import { useState } from 'react';

import { useT } from '@/shared/i18n';
import { useSetNavbarSlot } from '@/shared/lib/navbar-slot';
import { Input } from '@/shared/ui/shadcn/input';
import { useScripts } from '@/entities/script';
import { useScriptRunner } from '@/features/script-runner';
import { ScriptList } from '@/widgets/script-list';

export function ScriptsPage() {
    const t = useT();
    const [search, setSearch] = useState('');

    const { scripts, loading, refresh, hasAnyRunning, probeExternal } = useScripts();
    const { run, stop, stopAll } = useScriptRunner();

    const q = search.trim().toLowerCase();
    const filtered = q ? scripts.filter((s) => s.name.toLowerCase().includes(q)) : scripts;

    useSetNavbarSlot(
        <Input
            className="h-8 w-48"
            placeholder={t('scripts.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
        />,
    );

    return (
        <div className="mx-auto flex h-full w-full min-h-0 max-w-4xl flex-col">
            <ScriptList
                scripts={filtered}
                loading={loading}
                hasAnyRunning={hasAnyRunning}
                onRun={run}
                onStop={stop}
                onStopAll={async () => {
                    try {
                        await stopAll();
                    } finally {
                        void probeExternal();
                    }
                }}
                onRefresh={() => {
                    void refresh();
                    void probeExternal();
                }}
            />
        </div>
    );
}
