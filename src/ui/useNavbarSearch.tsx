import { useState } from 'react';

import { useSetNavbarSlot } from '@/lib/navbar';
import { Input } from '@/ui/shadcn/input';

/** Поиск в шапке; запрос возвращается trim + lowercase. */
export function useNavbarSearch(placeholder: string): string {
    const [query, setQuery] = useState('');

    useSetNavbarSlot(
        <Input
            className="h-8 w-48"
            placeholder={placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
        />,
    );

    return query.trim().toLowerCase();
}
