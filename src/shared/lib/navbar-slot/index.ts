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

/** Read the current navbar slot content (used by Navbar). */
export function useNavbarSlotContent(): ReactNode {
    return useContext(NavbarSlotValueCtx);
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
