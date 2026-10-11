import type { Script } from '@shared/types/scripts';

export interface ScriptRowProps {
    script: Script;
    onRun: (id: string) => Promise<void>;
    checking: boolean;
}
