import type { ReactNode } from 'react';
import type { Source } from '@shared/types';

export interface SourcesDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export interface FieldRowProps {
    label: string;
    htmlFor: string;
    children: ReactNode;
}

export interface SourceItemProps {
    source: Source;
    selected: boolean;
    onSelect: () => void;
    onDelete: () => void;
}

export interface NewSourceItemProps {
    onCancel: () => void;
}

export interface SourceFormFieldsProps {
    url: string;
    onUrlChange: (v: string) => void;
    branch: string;
    onBranchChange: (v: string) => void;
    isPrivate: boolean;
    onIsPrivateChange: (v: boolean) => void;
    autoFocusUrl?: boolean;
    token: string;
    onTokenChange: (v: string) => void;
    tokenLocked: boolean;
    onUnlock: () => void;
    mask: string | null;
}

export interface SourceSettingsProps {
    source: Source;
}

export interface NewSourcePanelProps {
    url: string;
    onUrlChange: (v: string) => void;
    onSaved: (sourceId: string) => void;
    onCancel: () => void;
}
