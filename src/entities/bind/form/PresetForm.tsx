import { SaveIcon } from 'lucide-react';

import { Button } from '@/ui/shadcn/button';
import { Card, CardContent, CardFooter } from '@/ui/shadcn/card';
import { Separator } from '@/ui/shadcn/separator';
import { Skeleton } from '@/ui/shadcn/skeleton';
import { Spinner } from '@/ui/shadcn/spinner';
import { useT } from '@/lib/i18n';
import { PresetFieldRow } from './PresetFieldRow';
import type { PresetFormProps } from './types';
import { usePresetForm } from './usePresetForm';

export function PresetForm({ sourceId, presetId }: PresetFormProps) {
    const t = useT();
    const { schema, values, loading, dirty, saving, setValue, save } = usePresetForm(sourceId, presetId);
    const sections = schema?.sections.filter((s) => s.fields.length > 0) ?? [];
    const hasAnyField = sections.length > 0;

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
                    ) : !hasAnyField ? (
                        <p className="py-4 text-center text-sm text-muted-foreground">{t('binds.schemaEmpty')}</p>
                    ) : (
                        <div className="flex flex-col gap-5">
                            {sections.map((section, index) => (
                                <div key={index} className="flex flex-col">
                                    {section.title && (
                                        <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                            {section.title}
                                        </h3>
                                    )}
                                    <div className="flex flex-col divide-y divide-border/60">
                                        {section.fields.map((f) => (
                                            <PresetFieldRow
                                                key={f.key}
                                                field={f}
                                                value={values[f.key]}
                                                onChange={(v) => setValue(f.key, v)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
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
