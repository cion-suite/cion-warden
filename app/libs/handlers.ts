import { shell } from 'electron';
import type { IpcHandlers } from '@cion-suite/core';
import { catalog } from '@app/catalog';
import { libs } from '@app/libs/files';
import { schema } from '@shared/schema';

export const libsHandlers = {
    'libs:list': {
        args: [schema.source.id.optional()],
        handle: async sourceId => (await catalog.metas(sourceId)).libs,
    },

    'libs:install': { args: [schema.source.id, schema.nonEmpty], handle: libs.install },

    'libs:sync': { args: [schema.source.id.optional()], handle: libs.sync },

    'libs:delete': { args: [schema.source.id, schema.nonEmpty], handle: libs.remove },

    'libs:folder:open': {
        args: [schema.source.id, schema.nonEmpty],
        handle: async (sourceId, libId) => {
            shell.showItemInFolder(await libs.local(sourceId, libId));
        },
    },

    'libs:web:open': {
        args: [schema.source.id, schema.nonEmpty],
        handle: async (sourceId, libId) => {
            await shell.openExternal(await libs.url(sourceId, libId));
        },
    },
} satisfies IpcHandlers;
