import { events, logger, type IpcHandlers } from '@cion-suite/core';
import { store, type SourceRecord } from '@app/sources/store';
import { tokens } from '@app/sources/tokens';
import { schema } from '@shared/schema';
import type { Source } from '@shared/types';

const log = logger.child('Sources');

// Маска - данные списка: сбой vault не прячет сами источники
async function toSource(record: SourceRecord): Promise<Source> {
    try {
        return { ...record, tokenMask: await tokens.mask(record.id) };
    } catch (e) {
        log.warn(`Token mask failed for ${record.id}`, e);
        return { ...record, tokenMask: null };
    }
}

export const sourcesHandlers = {
    'sources:list': async () => Promise.all((await store.list()).map(toSource)),

    'sources:add': {
        args: [schema.addSource],
        handle: async (options) => {
            const record = await store.add(options);
            events.emit('source:changed', { sourceId: record.id, type: 'add' });
            return toSource(record);
        },
    },

    'sources:update': {
        args: [schema.source.id, schema.updateSource],
        handle: async (sourceId, patch) => {
            const record = await store.update(sourceId, patch);
            if (patch.isPrivate === false) await tokens.remove(sourceId);
            events.emit('source:changed', { sourceId, type: 'update' });
            return toSource(record);
        },
    },

    'sources:remove': {
        args: [schema.source.id],
        handle: async (sourceId) => {
            // Токен первым: иначе сбой vault оставит секрет-сироту
            await tokens.remove(sourceId);
            await store.remove(sourceId);
            events.emit('source:changed', { sourceId, type: 'remove' });
        },
    },

    'sources:token:set': {
        args: [schema.source.id, schema.token],
        handle: async (sourceId, token) => {
            await store.get(sourceId);
            await tokens.set(sourceId, token);
            events.emit('source:changed', { sourceId, type: 'update' });
        },
    },

    'sources:token:remove': {
        args: [schema.source.id],
        handle: async (sourceId) => {
            await store.get(sourceId);
            await tokens.remove(sourceId);
            events.emit('source:changed', { sourceId, type: 'update' });
        },
    },
} satisfies IpcHandlers;
