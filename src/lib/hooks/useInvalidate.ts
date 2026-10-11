import { useQueryClient } from '@tanstack/react-query';
import type { IpcChannel } from '@cion-suite/core/renderer';

/** Сброс по каналу: ключи `[канал, ...args]` по префиксу. */
export function useInvalidate() {
    const client = useQueryClient();

    return async (...channels: IpcChannel[]): Promise<void> => {
        await Promise.all(channels.map((channel) => client.invalidateQueries({ queryKey: [channel] })));
    };
}
