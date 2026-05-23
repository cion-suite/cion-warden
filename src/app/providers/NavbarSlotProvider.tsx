import { useState, type ReactNode } from 'react';
import {
    NavbarSlotSetterCtx,
    NavbarSlotValueCtx,
    NavbarSubtitleSetterCtx,
    NavbarSubtitleValueCtx,
    NavbarTitleActionSetterCtx,
    NavbarTitleActionValueCtx,
    type NavbarTitleAction,
} from '@/shared/lib/navbar-slot';

export function NavbarSlotProvider({ children }: { children: ReactNode }) {
    const [content, setContent] = useState<ReactNode>(null);
    const [subtitle, setSubtitle] = useState<ReactNode>(null);
    const [titleAction, setTitleAction] = useState<NavbarTitleAction>(null);
    return (
        <NavbarSlotSetterCtx.Provider value={setContent}>
            <NavbarSlotValueCtx.Provider value={content}>
                <NavbarSubtitleSetterCtx.Provider value={setSubtitle}>
                    <NavbarSubtitleValueCtx.Provider value={subtitle}>
                        <NavbarTitleActionSetterCtx.Provider value={setTitleAction}>
                            <NavbarTitleActionValueCtx.Provider value={titleAction}>
                                {children}
                            </NavbarTitleActionValueCtx.Provider>
                        </NavbarTitleActionSetterCtx.Provider>
                    </NavbarSubtitleValueCtx.Provider>
                </NavbarSubtitleSetterCtx.Provider>
            </NavbarSlotValueCtx.Provider>
        </NavbarSlotSetterCtx.Provider>
    );
}
