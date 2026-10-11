import { useState } from 'react';

import { useBusy } from '@/lib/hooks/useBusy';
import { useInvalidate } from '@/lib/hooks/useInvalidate';
import { useT } from '@/lib/i18n';
import { toast } from '@/ui/toast';
import { useGithubToast } from '@/ui/useGithubToast';
import type { CatalogActionsConfig, CatalogItem } from './types';

/** Установка, удаление, папка и синхронизация каталога. */
export function useCatalogActions<T extends CatalogItem>(config: CatalogActionsConfig) {
    const t = useT();
    const githubToast = useGithubToast();
    const invalidate = useInvalidate();
    const busy = useBusy();
    const [bulkBusy, setBulkBusy] = useState(false);

    const key = (item: T) => `${item.sourceId}/${item.id}`;

    // Часть записей могла лечь и при отказе: сброс всегда
    const refreshLists = () => invalidate(...config.invalidate);

    const install = (item: T): Promise<void> =>
        busy.track(key(item), async () => {
            await githubToast.result(
                config.install(item.sourceId, item.id),
                t(`${config.i18n}.downloaded`, { name: item.name }),
            );
            await refreshLists();
        });

    const remove = (item: T): Promise<void> =>
        busy.track(key(item), async () => {
            await toast.result(config.remove(item.sourceId, item.id), {
                success: t(`${config.i18n}.deleted`, { name: item.name }),
                error: t('error'),
            });
            await refreshLists();
        });

    const openFolder = async (item: T): Promise<void> => {
        await toast.result(config.openFolder(item.sourceId, item.id), { error: t('error') });
    };

    const syncAll = async (): Promise<void> => {
        setBulkBusy(true);
        try {
            const { ok, failed } = await config.sync();
            if (failed > 0) toast.warning(t(`${config.i18n}.bulkDoneWithFails`, { ok, failed }));
            else toast.success(t(`${config.i18n}.bulkDone`, { ok }));
        } catch (e) {
            githubToast.error(e);
        } finally {
            setBulkBusy(false);
            await refreshLists();
        }
    };

    return {
        isBusy: (item: T): boolean => busy.ids.has(key(item)),
        bulkBusy,
        install,
        remove,
        openFolder,
        syncAll,
    };
}
