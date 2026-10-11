import { useState } from 'react';

import { useUpdaterRefresh, useUpdateState, type UpdateState } from '@/shell/update';

export type UpdateStatus =
    | UpdateState
    | { kind: 'checking' }
    | { kind: 'latest'; checkedAt: number };

/** Стадия обновления плюс исход ручной проверки. */
export function useUpdateStatus() {
    const { checking, check } = useUpdaterRefresh();
    const { state, reset } = useUpdateState();
    const [checkedAt, setCheckedAt] = useState<number | null>(null);

    const refresh = async () => {
        reset();
        if (await check()) setCheckedAt(Date.now());
    };

    // Тишина после refresh - версия актуальна
    const status: UpdateStatus = checking
        ? { kind: 'checking' }
        : state.kind === 'idle' && checkedAt !== null
            ? { kind: 'latest', checkedAt }
            : state;

    return { status, refresh };
}
