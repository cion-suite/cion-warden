import { DownloadIcon } from 'lucide-react';

import { ListRow } from '@/ui/ListRow';
import { Badge } from '@/ui/shadcn/badge';
import { Button } from '@/ui/shadcn/button';
import { useT } from '@/lib/i18n';
import type { CatalogScriptRowProps } from './types';

export function CatalogScriptRow({ script, downloading, onInstall }: CatalogScriptRowProps) {
    const t = useT();

    return (
        <ListRow title={script.name} subtitle={script.sourceName}>
            {script.hasUpdate && (
                <Badge variant="destructive" className="text-xs">
                    {t('getScripts.updateAvailable')}
                </Badge>
            )}

            {!script.isDownloaded ? (
                <Button size="sm" disabled={downloading} onClick={() => onInstall(script)}>
                    <DownloadIcon data-icon="inline-start" />
                    {t('getScripts.get')}
                </Button>
            ) : script.hasUpdate ? (
                <Button variant="outline" size="sm" disabled={downloading} onClick={() => onInstall(script)}>
                    <DownloadIcon data-icon="inline-start" />
                    {t('getScripts.update')}
                </Button>
            ) : (
                <Button variant="ghost" size="sm" disabled>
                    {t('getScripts.upToDate')}
                </Button>
            )}
        </ListRow>
    );
}
