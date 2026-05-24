import { useRef, useState } from 'react';

import { useT } from '@/shared/i18n';
import { toast } from '@/shared/lib/toast';
import type { MissingItem } from '@shared/types/script-deps';

export type ResolveDialogState =
    | { kind: 'closed' }
    | { kind: 'confirm'; scriptId: string; missing: MissingItem[]; unknown: string[] }
    | {
          kind: 'downloading';
          scriptId: string;
          total: number;
          done: number;
          currentName?: string;
      };

async function downloadItem(item: MissingItem): Promise<void> {
    if (item.kind === 'lib') {
        await window.app?.libs.download(item.sourceId, item.libId);
    } else {
        await window.app?.binds.download(item.sourceId, item.presetId);
    }
}

export function useRunWithDeps() {
    const t = useT();
    const [state, setState] = useState<ResolveDialogState>({ kind: 'closed' });
    const [checkingId, setCheckingId] = useState<string | null>(null);
    const inFlight = useRef<Set<string>>(new Set());

    const run = async (id: string): Promise<void> => {
        if (inFlight.current.has(id)) return;
        inFlight.current.add(id);
        setCheckingId(id);
        try {
            const res = await window.app?.scripts.checkDeps(id);
            if (!res || res.missing.length === 0) {
                await window.app?.scripts.run(id);
                return;
            }
            setState({
                kind: 'confirm',
                scriptId: id,
                missing: res.missing,
                unknown: res.unknown,
            });
        } catch {
            toast.error(t('error'));
        } finally {
            inFlight.current.delete(id);
            setCheckingId((prev) => (prev === id ? null : prev));
        }
    };

    const handleConfirm = async (): Promise<void> => {
        if (state.kind !== 'confirm') return;
        const { missing, scriptId } = state;
        setState({ kind: 'downloading', scriptId, total: missing.length, done: 0 });

        let failed = 0;
        for (let i = 0; i < missing.length; i++) {
            const item = missing[i]!;
            setState({
                kind: 'downloading',
                scriptId,
                total: missing.length,
                done: i,
                currentName: item.name,
            });
            try {
                await downloadItem(item);
            } catch {
                failed++;
            }
        }
        setState({ kind: 'closed' });

        if (failed > 0) {
            toast.error(t('scripts.deps.downloadFailed', { count: failed }));
            return;
        }
        await window.app?.scripts.run(scriptId);
    };

    const handleCancel = (): void => {
        if (state.kind === 'downloading') return;
        setState({ kind: 'closed' });
    };

    return { run, state, checkingId, onConfirm: handleConfirm, onCancel: handleCancel };
}
