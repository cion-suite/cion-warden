import { useState } from 'react';
import { useEvent } from '@cion-suite/core/renderer';

export type UpdateState =
    | { kind: 'idle' }
    | { kind: 'available'; version: string; percent: number }
    | { kind: 'ready'; version: string }
    | { kind: 'failed'; message: string };

/** Стадия обновления по событиям updater:*. */
export function useUpdateState() {
    const [state, setState] = useState<UpdateState>({ kind: 'idle' });

    useEvent('updater:available', (info) =>
        setState({ kind: 'available', version: info.version, percent: 0 }),
    );
    useEvent('updater:progress', (progress) =>
        setState((prev) =>
            prev.kind === 'available' ? { ...prev, percent: Math.round(progress.percent) } : prev,
        ),
    );
    useEvent('updater:downloaded', (info) => setState({ kind: 'ready', version: info.version }));
    // Сбой фоновой проверки не отменяет скачанное
    useEvent('updater:failed', (data) =>
        setState((prev) => (prev.kind === 'ready' ? prev : { kind: 'failed', message: data.message })),
    );

    return { state, reset: () => setState({ kind: 'idle' }) };
}
