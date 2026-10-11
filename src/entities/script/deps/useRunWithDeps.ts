import { useRef, useState } from 'react';

import { toast } from '@/ui/toast';
import { useGithubToast } from '@/ui/useGithubToast';
import { useInvalidate } from '@/lib/hooks/useInvalidate';
import { useT } from '@/lib/i18n';
import type { ScriptDeps } from '@shared/types/script-deps';
import { installMissing } from './install-missing';
import type { ResolveDialogState } from './types';

export function useRunWithDeps() {
    const t = useT();
    const githubToast = useGithubToast();
    const invalidate = useInvalidate();
    const [state, setState] = useState<ResolveDialogState>({ kind: 'closed' });
    const [checkingId, setCheckingId] = useState<string | null>(null);
    const inFlight = useRef<Set<string>>(new Set());

    const runScript = (id: string) => toast.result(window.scripts.run(id), { error: t('error') });

    const run = async (id: string): Promise<void> => {
        if (inFlight.current.has(id)) return;
        inFlight.current.add(id);
        setCheckingId(id);
        try {
            let deps: ScriptDeps;
            try {
                deps = await window.scripts.deps.get(id);
            } catch (e) {
                githubToast.error(e);
                return;
            }
            if (deps.missing.length === 0) {
                await runScript(id);
                return;
            }
            setState({ kind: 'confirm', scriptId: id, missing: deps.missing, unknown: deps.unknown });
        } finally {
            inFlight.current.delete(id);
            setCheckingId((prev) => (prev === id ? null : prev));
        }
    };

    const onConfirm = async (): Promise<void> => {
        if (state.kind !== 'confirm') return;
        const { missing, scriptId } = state;

        const failed = await installMissing(missing, (done, item) => {
            setState({
                kind: 'downloading',
                scriptId,
                total: missing.length,
                done,
                currentName: item.name,
            });
        });
        setState({ kind: 'closed' });
        void invalidate('libs:list', 'binds:list');

        if (failed > 0) {
            toast.error(t('scripts.deps.downloadFailed', { count: failed }));
            return;
        }
        await runScript(scriptId);
    };

    const onCancel = (): void => {
        if (state.kind === 'downloading') return;
        setState({ kind: 'closed' });
    };

    return { run, state, checkingId, onConfirm, onCancel };
}
