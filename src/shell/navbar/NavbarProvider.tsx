import { useState, type ReactNode } from 'react';

import { NavbarSetterContext, NavbarValueContext } from '@/lib/navbar';
import type { NavbarCrumb } from '@/lib/types/navbar';

export function NavbarProvider({ children }: { children: ReactNode }) {
    const [slot, setSlot] = useState<ReactNode>(null);
    const [crumb, setCrumb] = useState<NavbarCrumb | null>(null);

    // Объект стабилен: его мемоизирует React Compiler
    const setters = { setSlot, setCrumb };

    return (
        <NavbarSetterContext value={setters}>
            <NavbarValueContext value={{ slot, crumb }}>{children}</NavbarValueContext>
        </NavbarSetterContext>
    );
}
