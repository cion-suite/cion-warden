import { useEffect, useRef, useState } from 'react';

export function useAsyncList<T>(loader: () => Promise<T[] | undefined> | undefined) {
    const [items, setItems] = useState<T[]>([]);
    const [loading, setLoading] = useState(true);
    const loaderRef = useRef(loader);
    loaderRef.current = loader;

    const refresh = async (): Promise<void> => {
        setLoading(true);
        try {
            const list = (await loaderRef.current()) ?? [];
            setItems(list);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void refresh();
    }, []);

    return { items, setItems, loading, refresh };
}
