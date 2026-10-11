import { useState } from 'react';
import { SearchIcon } from 'lucide-react';

import { useSetNavbarSlot } from '@/lib/navbar';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/ui/shadcn/input-group';

/** Поиск в шапке; запрос возвращается trim + lowercase. */
export function useNavbarSearch(placeholder: string): string {
    const [query, setQuery] = useState('');

    useSetNavbarSlot(
        <InputGroup className="h-8 w-48">
            <InputGroupAddon align="inline-start">
                <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
                placeholder={placeholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
            />
        </InputGroup>,
    );

    return query.trim().toLowerCase();
}
