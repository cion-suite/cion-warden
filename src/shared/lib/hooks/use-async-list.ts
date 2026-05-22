import { useEffect, useRef, useState } from 'react';

export function useAsyncList<T>(loader: () => Promise<T[] | undefined> | undefined) {
    const [items, setItems] = useState<T[]>([]);
    const [loading, setLoading] = useState(true);
    const loaderRef = useRef(loader);
    loaderRef.current = loader;

    const tokenRef = useRef(0);
    const pendingRef = useRef<Promise<void> | null>(null);
    const dirtyRef = useRef(false);

    const runOnce = async (): Promise<void> => {
        const myToken = ++tokenRef.current;
        setLoading(true);
        try {
            const list = (await loaderRef.current()) ?? [];
            if (myToken === tokenRef.current) setItems(list);
        } finally {
            if (myToken === tokenRef.current) setLoading(false);
        }
    };

    const refresh = async (): Promise<void> => {
        if (pendingRef.current) {
            dirtyRef.current = true;
            return pendingRef.current;
        }
        const run = async (): Promise<void> => {
            try {
                await runOnce();
                while (dirtyRef.current) {
                    dirtyRef.current = false;
                    await runOnce();
                }
            } finally {
                pendingRef.current = null;
            }
        };
        pendingRef.current = run();
        return pendingRef.current;
    };

    useEffect(() => {
        void refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { items, setItems, loading, refresh };
}
