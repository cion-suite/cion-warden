import { useState } from 'react';

function bump(prev: ReadonlyMap<string, number>, id: string, delta: 1 | -1): Map<string, number> {
    const next = new Map(prev);
    const count = (next.get(id) ?? 0) + delta;
    if (count <= 0) next.delete(id);
    else next.set(id, count);
    return next;
}

/** Занятые id: счётчик на id, операции не гасят друг друга. */
export function useBusy() {
    const [counts, setCounts] = useState<ReadonlyMap<string, number>>(() => new Map());

    const track = async <T>(id: string, op: () => Promise<T>): Promise<T> => {
        setCounts((prev) => bump(prev, id, 1));
        try {
            return await op();
        } finally {
            setCounts((prev) => bump(prev, id, -1));
        }
    };

    const ids: ReadonlySet<string> = new Set(counts.keys());
    return { ids, track };
}
