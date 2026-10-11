import type { MissingItem } from '@shared/types/script-deps';

export type ResolveDialogState =
    | { kind: 'closed' }
    | { kind: 'confirm'; scriptId: string; missing: MissingItem[]; unknown: string[] }
    | {
          kind: 'downloading';
          scriptId: string;
          total: number;
          done: number;
          currentName?: string;
      };

export interface MissingLibsDialogProps {
    state: ResolveDialogState;
    onConfirm: () => void;
    onCancel: () => void;
}
