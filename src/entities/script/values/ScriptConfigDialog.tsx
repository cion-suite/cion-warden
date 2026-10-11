import { ConfigForm, configValues } from '@/kit/config-form';
import { Button } from '@/ui/shadcn/button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/ui/shadcn/dialog';
import { Skeleton } from '@/ui/shadcn/skeleton';
import { Spinner } from '@/ui/shadcn/spinner';
import { useT } from '@/lib/i18n';
import type { ScriptConfigDialogProps, ScriptConfigFormProps } from './types';
import { useScriptConfig } from './useScriptConfig';

// Монтируется заново на каждое открытие,
// поэтому правки не переживают закрытие
function ScriptConfigForm({ script, onClose }: ScriptConfigFormProps) {
    const t = useT();
    const { schema, values, loading, dirty, saving, setValue, save } = useScriptConfig(script.id, onClose);
    const hasAnyField = configValues.fields(schema).length > 0;

    return (
        <>
            <DialogHeader>
                <DialogTitle>
                    {script.name} - {t('scripts.configDialog.title')}
                </DialogTitle>
            </DialogHeader>

            <div className="max-h-[min(60vh,420px)] overflow-y-auto">
                {loading ? (
                    <div className="flex flex-col gap-2">
                        {Array.from({ length: 4 }, (_, i) => (
                            <Skeleton key={i} className="h-8" />
                        ))}
                    </div>
                ) : schema && hasAnyField ? (
                    <ConfigForm schema={schema} values={values} onChange={setValue} />
                ) : (
                    <p className="py-4 text-center text-sm text-muted-foreground">{t('scripts.configDialog.empty')}</p>
                )}
            </div>

            <DialogFooter>
                <Button variant="ghost" onClick={onClose}>
                    {t('cancel')}
                </Button>
                <Button disabled={!dirty || saving} onClick={() => void save()}>
                    {saving && <Spinner data-icon="inline-start" />}
                    {t('scripts.configDialog.save')}
                </Button>
            </DialogFooter>
        </>
    );
}

export function ScriptConfigDialog({ script, open, onOpenChange }: ScriptConfigDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm" aria-describedby={undefined}>
                <ScriptConfigForm script={script} onClose={() => onOpenChange(false)} />
            </DialogContent>
        </Dialog>
    );
}
