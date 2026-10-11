import type { IpcHandlers } from '@cion-suite/core';
import { installer } from '@app/fonts/installer';
import { store } from '@app/sources/store';
import { schema } from '@shared/schema';

export const fontsHandlers = {
    'fonts:list': () => installer.list(),

    'fonts:install': {
        args: [schema.source.id],
        handle: async sourceId => installer.install(await store.get(sourceId)),
    },

    'fonts:remove': { args: [schema.source.id], handle: sourceId => installer.remove(sourceId) },
} satisfies IpcHandlers;
