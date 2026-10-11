import { useState, type ReactElement } from 'react';
import { PlugIcon } from 'lucide-react';

import { useT } from '@/lib/i18n';
import { Button } from '@/ui/shadcn/button';

import { SourcesDialog } from './SourcesDialog';
import { useSources } from './useSources';

export function SourcesButton(): ReactElement {
    const t = useT();
    const [open, setOpen] = useState(false);
    // Список грузится до открытия диалога
    useSources();

    return (
        <>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                <PlugIcon data-icon="inline-start" />
                {t('sources.title')}
            </Button>
            <SourcesDialog open={open} onOpenChange={setOpen} />
        </>
    );
}
