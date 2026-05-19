import { useState, type ReactNode } from 'react';
import { NavbarSlotSetterCtx, NavbarSlotValueCtx } from '@/shared/lib/navbar-slot';

export function NavbarSlotProvider({ children }: { children: ReactNode }) {
    const [content, setContent] = useState<ReactNode>(null);
    return (
        <NavbarSlotSetterCtx.Provider value={setContent}>
            <NavbarSlotValueCtx.Provider value={content}>
                {children}
            </NavbarSlotValueCtx.Provider>
        </NavbarSlotSetterCtx.Provider>
    );
}
