import { useState } from 'react';

import type { StorageEntry } from './define-storage.js';

export function useStorage<T>(entry: StorageEntry<T>) {
    const [value, setValue] = useState<T>(() => entry.get());

    function setStoredValue(newValue: T) {
        entry.set(newValue);
        setValue(newValue);
    }

    return [value, setStoredValue] as const;
}
