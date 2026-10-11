import type { ConfigSchema } from './config';

export type ScriptStatus = 'idle' | 'running' | 'error';

export interface Script {
    id: string;
    name: string;
    filePath: string;
    /** Поля cfg скрипта; нет файла или полей - не задан. */
    config?: ConfigSchema;
    status: ScriptStatus;
    errorMessage?: string;
    modifiedAt?: number;
}
