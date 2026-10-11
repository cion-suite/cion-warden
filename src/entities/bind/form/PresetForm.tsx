import { SaveIcon } from 'lucide-react';

import { ConfigForm, configValues } from '@/kit/config-form';
import { Button } from '@/ui/shadcn/button';
import { Card, CardContent, CardFooter } from '@/ui/shadcn/card';
import { Separator } from '@/ui/shadcn/separator';
import { Skeleton } from '@/ui/shadcn/skeleton';
import { Spinner } from '@/ui/shadcn/spinner';
import { useT } from '@/lib/i18n';
import type { PresetFormProps } from './types';
import { usePresetForm } from './usePresetForm';

export function PresetForm({ sourceId, presetId }: PresetFormProps) {
    const t = useT();
    const { schema, values, loading, dirty, saving, setValue, save } = usePresetForm(sourceId, presetId);
    const hasAnyField = configValues.fields(schema).length > 0;

    return (
        <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col">
            <Card className="flex h-full min-h-0 w-full flex-col gap-0 py-0">
                <CardContent className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                    {loading ? (
                        <div className="flex flex-col gap-2">
                            {Array.from({ length: 5 }, (_, i) => (
                                <Skeleton key={i} className="h-8" />
                            ))}
                        </div>
                    ) : schema && hasAnyField ? (
                        <ConfigForm schema={schema} values={values} onChange={setValue} />
                    ) : (
                        <p className="py-4 text-center text-sm text-muted-foreground">{t('binds.schemaEmpty')}</p>
                    )}
                </CardContent>
                {hasAnyField && (
                    <>
                        <Separator />
                        <CardFooter className="justify-end px-5 py-2.5">
                            <Button size="sm" onClick={() => void save()} disabled={!dirty || saving}>
                                {saving ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}
                                {t('binds.save')}
                            </Button>
                        </CardFooter>
                    </>
                )}
            </Card>
        </div>
    );
}
