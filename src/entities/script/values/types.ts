import type { Script } from '@shared/types';

export interface ScriptConfigDialogProps {
    script: Script;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export interface ScriptConfigFormProps {
    script: Script;
    onClose: () => void;
}
