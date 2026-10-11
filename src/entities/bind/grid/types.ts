import type { Bind } from '@shared/types';

export interface BindCardProps {
    bind: Bind;
    busy: boolean;
    onOpen: (bind: Bind) => void;
    onInstall: (bind: Bind) => void;
    onDelete: (bind: Bind) => void;
    onOpenFolder: (bind: Bind) => void;
}
