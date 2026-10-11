import { useState } from 'react';

import { useInvalidate } from '@/lib/hooks/useInvalidate';
import { useT } from '@/lib/i18n';
import { useGithubToast } from '@/ui/useGithubToast';

export function useSourcesSync() {
    const t = useT();
    const invalidate = useInvalidate();
    const githubToast = useGithubToast();
    const [syncing, setSyncing] = useState(false);

    const sync = async (): Promise<boolean> => {
        setSyncing(true);
        try {
            // Пустой текст - без тоста, когда источников нет
            const ok = await githubToast.result(window.catalog.sync(), (r) =>
                r.length > 0 ? t('sources.syncDone') : '',
            );
            await invalidate('libs:list', 'binds:list', 'catalog:scripts:list');
            return ok;
        } finally {
            setSyncing(false);
        }
    };

    return { syncing, sync };
}
