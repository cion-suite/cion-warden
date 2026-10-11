import { useState } from 'react';

import { useGithubToast } from '@/ui/useGithubToast';
import { useInvalidate } from '@/lib/hooks/useInvalidate';
import { useT } from '@/lib/i18n';
import type { CatalogScript } from '@shared/types/catalog';

export function useInstallScript() {
    const t = useT();
    const githubToast = useGithubToast();
    const invalidate = useInvalidate();
    const [downloadingId, setDownloadingId] = useState<string | null>(null);

    const install = async (script: CatalogScript): Promise<void> => {
        setDownloadingId(script.id);
        try {
            const ok = await githubToast.result(
                window.catalog.scripts.install(script.sourceId, script.fileName),
                t('getScripts.downloaded', { name: script.name }),
            );
            // Main событие не эмитит, ждём обновлённый список
            if (ok) await invalidate('catalog:scripts:list', 'scripts:list');
        } finally {
            setDownloadingId(null);
        }
    };

    return { downloadingId, install };
}
