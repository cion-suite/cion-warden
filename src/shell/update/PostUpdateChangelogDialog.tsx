import { SparklesIcon } from 'lucide-react';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogMedia,
    AlertDialogTitle,
} from '@/ui/shadcn/alert-dialog';
import { Badge } from '@/ui/shadcn/badge';
import { ScrollArea } from '@/ui/shadcn/scroll-area';
import { Markdown } from '@/ui/markdown';
import { useT } from '@/lib/i18n';
import { usePostUpdateChangelog } from './usePostUpdateChangelog';

export function PostUpdateChangelogDialog() {
    const t = useT();
    const { version } = window.app.env;
    const { open, changelog, fromVersion, isBeta, close } = usePostUpdateChangelog();

    return (
        <AlertDialog open={open}>
            <AlertDialogContent className="data-[size=default]:max-w-xl data-[size=default]:sm:max-w-xl">
                <AlertDialogHeader>
                    <AlertDialogMedia>
                        <SparklesIcon />
                    </AlertDialogMedia>
                    <AlertDialogTitle className="flex items-center gap-2">
                        {t(isBeta ? 'changelog.dialog.titleBeta' : 'changelog.dialog.title')}
                        <Badge variant="secondary" className="font-mono">
                            v{version}
                        </Badge>
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {t('changelog.dialog.since', { version: fromVersion })}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                {/* max-h + inherit: короткий лог не растягивает диалог */}
                <ScrollArea className="max-h-[50vh] rounded-lg border bg-muted/30 [&_[data-slot=scroll-area-viewport]]:max-h-[inherit] [&_[data-slot=scroll-area-viewport]>div]:block!">
                    <Markdown className="p-3">{changelog}</Markdown>
                </ScrollArea>
                <AlertDialogFooter>
                    <AlertDialogAction onClick={close}>{t('changelog.dialog.close')}</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
