import { shell } from 'electron';
import type { IpcHandlers } from '@cion-suite/core';
import { catalog } from '@app/catalog';
import { binds } from '@app/binds/files';
import { schema } from '@shared/schema';

const target = [schema.source.id, schema.nonEmpty] as const;

export const bindsHandlers = {
    'binds:list': {
        args: [schema.source.id.optional()],
        handle: async sourceId => (await catalog.metas(sourceId)).presets,
    },

    'binds:install': { args: [...target], handle: binds.install },

    'binds:sync': { args: [schema.source.id.optional()], handle: binds.sync },

    'binds:delete': { args: [...target], handle: binds.remove },

    'binds:folder:open': {
        args: [...target],
        handle: async (sourceId, presetId) => {
            shell.showItemInFolder(await binds.local(sourceId, presetId));
        },
    },

    'binds:schema:get': { args: [...target], handle: binds.schema },

    'binds:values:get': { args: [...target], handle: binds.values.get },

    'binds:values:save': {
        args: [schema.source.id, schema.nonEmpty, schema.preset.values],
        handle: binds.values.save,
    },

    'binds:values:reset': { args: [...target], handle: binds.values.reset },
} satisfies IpcHandlers;
