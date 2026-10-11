import { errors, type IpcHandlers } from '@cion-suite/core';
import { github } from '@app/github';
import { store } from '@app/sources/store';
import { tokens } from '@app/sources/tokens';
import { schema } from '@shared/schema';

export const githubHandlers = {
    'github:limit:get': () => github.limit(),

    'github:repo:get': {
        args: [schema.source.id],
        handle: async (sourceId) => {
            const source = await store.get(sourceId);
            const token = await tokens.get(sourceId);
            if (token === null) throw errors.fail('unauthorized', 'No token');
            return github.probe(source, token);
        },
    },
} satisfies IpcHandlers;
