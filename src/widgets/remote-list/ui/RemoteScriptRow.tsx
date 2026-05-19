import { Download } from 'lucide-react';

import { useT } from '@/shared/i18n';
import { Badge } from '@/shared/ui/shadcn/badge';
import { Button } from '@/shared/ui/shadcn/button';
import type { RemoteScriptMeta } from '@shared/types/get-scripts';

interface RemoteScriptRowProps {
    script: RemoteScriptMeta;
    downloading: boolean;
    onDownload: (script: RemoteScriptMeta) => void;
}

export function RemoteScriptRow({ script, downloading, onDownload }: RemoteScriptRowProps) {
    const t = useT();

    return (
        <div className="flex items-center justify-between gap-4 rounded-lg border bg-card px-4 py-3">
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-none">{script.name}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{script.sourceName}</p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
                {script.hasUpdate && (
                    <Badge variant="destructive" className="text-xs">
                        {t('getScripts.updateAvailable')}
                    </Badge>
                )}

                {!script.isDownloaded ? (
                    <Button
                        size="sm"
                        disabled={downloading}
                        onClick={() => onDownload(script)}
                    >
                        <Download data-icon="inline-start" />
                        {t('getScripts.get')}
                    </Button>
                ) : script.hasUpdate ? (
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={downloading}
                        onClick={() => onDownload(script)}
                    >
                        <Download data-icon="inline-start" />
                        {t('getScripts.update')}
                    </Button>
                ) : (
                    <Button variant="ghost" size="sm" disabled>
                        {t('getScripts.upToDate')}
                    </Button>
                )}
            </div>
        </div>
    );
}
