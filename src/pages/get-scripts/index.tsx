import { useT } from '@/shared/i18n';
import { Card } from '@/shared/ui/shadcn/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/shadcn/empty';

export function GetScriptsPage() {
    const t = useT();
    return (
        <div className="flex h-full w-full min-h-0 p-4">
            <Card className="flex h-full min-h-0 w-full flex-col items-center justify-center">
                <Empty>
                    <EmptyHeader>
                        <EmptyTitle>{t('nav.getScripts')}</EmptyTitle>
                        <EmptyDescription>Coming soon</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            </Card>
        </div>
    );
}
