import { createContext, type ReactNode } from 'react';

import type { NavbarCrumb } from '@/lib/types/navbar';

export type NavbarValue = {
    slot: ReactNode
    crumb: NavbarCrumb | null
};

type NavbarSetters = {
    setSlot: (slot: ReactNode) => void
    setCrumb: (crumb: NavbarCrumb | null) => void
};

export const NavbarValueContext = createContext<NavbarValue>({ slot: null, crumb: null });

// Сеттеры отдельно: страницы только пишут, значение не читают
export const NavbarSetterContext = createContext<NavbarSetters>({
    setSlot: () => {},
    setCrumb: () => {},
});
