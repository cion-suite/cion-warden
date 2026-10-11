import type { ReactNode } from 'react';
import type { Script } from '@shared/types/scripts';

export interface ScriptConfigDialogProps {
    script: Script;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export interface ScriptConfigFormProps {
    script: Script;
    configPath: string;
    onClose: () => void;
}

export interface ValueRowProps {
    description: string;
    tooltip?: string;
    children: ReactNode;
}
