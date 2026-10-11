import { useQueryClient } from '@tanstack/react-query';
import { useEvent, type EventMap, type IpcChannel } from '@cion-suite/core/renderer';

import type { Script } from '@shared/types';

const SOURCE_LISTS: IpcChannel[] = ['libs:list', 'binds:list', 'catalog:scripts:list'];
const BIND_FORMS: IpcChannel[] = ['binds:schema:get'];

/** Статус скрипта из события в закешированном списке. */
export function patchStatus(
    list: Script[] | undefined,
    e: EventMap['script:status:changed'],
): Script[] | undefined {
    return list?.map((script) =>
        script.id === e.id ? { ...script, status: e.status, errorMessage: e.errorMessage } : script,
    );
}

/** Карта событие -> запросы react-query; подписки только здесь. */
export function useQuerySync(): void {
    const client = useQueryClient();
    const invalidate = (...channels: IpcChannel[]) => {
        for (const channel of channels) void client.invalidateQueries({ queryKey: [channel] });
    };

    useEvent('source:synced', () => invalidate(...SOURCE_LISTS));
    useEvent('source:changed', () => invalidate('sources:list', ...SOURCE_LISTS, ...BIND_FORMS));
    useEvent('lib:changed', () => invalidate('libs:list'));
    useEvent('bind:changed', () => invalidate('binds:list', ...BIND_FORMS));
    useEvent('script:changed', () =>
        invalidate('scripts:list', 'scripts:processes:get', 'catalog:scripts:list'),
    );
    useEvent('script:status:changed', (e) => {
        client.setQueryData<Script[]>(['scripts:list'], (list) => patchStatus(list, e));
        if (e.status === 'running') client.setQueryData(['scripts:processes:get'], true);
        else invalidate('scripts:processes:get');
    });
    useEvent('github:limit:changed', () => invalidate('github:limit:get'));
}
