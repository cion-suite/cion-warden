import type { IpcChannel } from '@cion-suite/core/renderer';

/** Минимум, который нужен действиям над элементом каталога. */
export interface CatalogItem {
    id: string
    name: string
    sourceId: string
}

/** Различия видов каталога: каналы и префикс i18n. */
export interface CatalogActionsConfig {
    /** Префикс ключей downloaded, deleted, bulkDone... */
    i18n: string
    /** Запросы, которые сбрасываются после каждой операции. */
    invalidate: IpcChannel[]
    install: (sourceId: string, id: string) => Promise<void>
    remove: (sourceId: string, id: string) => Promise<void>
    openFolder: (sourceId: string, id: string) => Promise<void>
    sync: () => Promise<{ ok: number; failed: number }>
}
