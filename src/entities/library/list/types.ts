import type { Lib } from '@shared/types';

export interface LibraryRowProps {
    lib: Lib;
    busy: boolean;
    onInstall(lib: Lib): void;
    onRemove(lib: Lib): void;
    onOpenFolder(lib: Lib): void;
    onOpenWeb(lib: Lib): void;
}
