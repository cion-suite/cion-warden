import type { z } from 'zod';
import type { schema } from '../schema';

export type SourceType = 'git';

export interface Source {
    id: string;
    type: SourceType;
    name: string;
    url: string;
    branch: string;
    isPrivate: boolean;
    /** Маска PAT или null; сам токен в renderer не уходит. */
    tokenMask: string | null;
}

export type AddSourceOptions = z.input<typeof schema.addSource>;
export type UpdateSourceOptions = z.input<typeof schema.updateSource>;
