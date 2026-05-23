import {
    createContext,
    useContext,
    useLayoutEffect,
    type Dispatch,
    type ReactNode,
    type SetStateAction,
} from 'react';

// Setter lives in a separate context so consumers that only write
// don't re-render when the rendered content changes.
export const NavbarSlotSetterCtx = createContext<Dispatch<SetStateAction<ReactNode>>>(() => {});
export const NavbarSlotValueCtx = createContext<ReactNode>(null);

// Subtitle slot is rendered next to the route title (after the title separator).
// Use it for breadcrumb tails like " / page_name".
export const NavbarSubtitleSetterCtx = createContext<Dispatch<SetStateAction<ReactNode>>>(() => {});
export const NavbarSubtitleValueCtx = createContext<ReactNode>(null);

// Title action — when set, Navbar renders the route title as a clickable
// button. Pages use this to expose a "back" affordance on the title itself
// (e.g. clicking "Binds" returns from a sub-view to the grid).
export type NavbarTitleAction = (() => void) | null;
export const NavbarTitleActionSetterCtx = createContext<
    Dispatch<SetStateAction<NavbarTitleAction>>
>(() => {});
export const NavbarTitleActionValueCtx = createContext<NavbarTitleAction>(null);

/** Read the current navbar slot content (used by Navbar). */
export function useNavbarSlotContent(): ReactNode {
    return useContext(NavbarSlotValueCtx);
}

export function useNavbarSubtitleContent(): ReactNode {
    return useContext(NavbarSubtitleValueCtx);
}

export function useNavbarTitleAction(): NavbarTitleAction {
    return useContext(NavbarTitleActionValueCtx);
}

/**
 * Inject `content` into the Navbar slot.
 * Runs after every render so the slot stays in sync with local state.
 * Clears automatically on unmount.
 */
export function useSetNavbarSlot(content: ReactNode): void {
    const setContent = useContext(NavbarSlotSetterCtx);

    // Sync slot content after every render (keeps search value up-to-date).
    useLayoutEffect(() => {
        setContent(content);
    });

    // Clear on unmount.
    useLayoutEffect(() => {
        return () => setContent(null);
    }, [setContent]);
}

/** Inject breadcrumb subtitle next to the route title. */
export function useSetNavbarSubtitle(content: ReactNode): void {
    const setContent = useContext(NavbarSubtitleSetterCtx);

    useLayoutEffect(() => {
        setContent(content);
    });

    useLayoutEffect(() => {
        return () => setContent(null);
    }, [setContent]);
}

/**
 * Make the route title clickable. Pass `null` to revert to plain text.
 * Cleared automatically on unmount.
 */
export function useSetNavbarTitleAction(handler: NavbarTitleAction): void {
    const setAction = useContext(NavbarTitleActionSetterCtx);

    useLayoutEffect(() => {
        setAction(() => handler);
    });

    useLayoutEffect(() => {
        return () => setAction(null);
    }, [setAction]);
}
