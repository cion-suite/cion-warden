import { useContext, useLayoutEffect, type ReactNode } from 'react';

import type { NavbarCrumb } from '@/lib/types/navbar';
import { NavbarSetterContext, NavbarValueContext, type NavbarValue } from './navbar-context';

/** Содержимое шапки: читает Navbar. */
export function useNavbar(): NavbarValue {
    return useContext(NavbarValueContext);
}

/** Слот справа в шапке; чистится на unmount. */
export function useSetNavbarSlot(content: ReactNode): void {
    const { setSlot } = useContext(NavbarSetterContext);

    useLayoutEffect(() => {
        setSlot(content);
    });

    useLayoutEffect(() => () => setSlot(null), [setSlot]);
}

/** Хвост крошек после названия раздела; null - убрать. */
export function useSetNavbarCrumb(crumb: NavbarCrumb | null): void {
    const { setCrumb } = useContext(NavbarSetterContext);

    useLayoutEffect(() => {
        setCrumb(crumb);
    });

    useLayoutEffect(() => () => setCrumb(null), [setCrumb]);
}
