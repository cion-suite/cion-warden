import type { IpcHandlers } from '@cion-suite/core';
import { catalog } from '@app/catalog';
import { install } from '@app/catalog/install';
import { sync } from '@app/catalog/sync';
import { schema } from '@shared/schema';

export const catalogHandlers = {
    'catalog:sync': { args: [schema.source.id.optional()], handle: sync },

    'catalog:scripts:list': {
        args: [schema.source.id.optional()],
        handle: async sourceId => (await catalog.metas(sourceId)).scripts,
    },

    'catalog:scripts:install': { args: [schema.source.id, schema.file.name], handle: install },
} satisfies IpcHandlers;
