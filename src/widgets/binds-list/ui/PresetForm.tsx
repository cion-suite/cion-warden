import { useEffect, useState } from 'react';
import { CircleHelp, Loader2, RotateCcw, Save } from 'lucide-react';

import { useT } from '@/shared/i18n';
import { KeyBindInput } from '@/shared/ui/key-bind-input';
import { Button } from '@/shared/ui/shadcn/button';
import { Card, CardContent, CardFooter } from '@/shared/ui/shadcn/card';
import { Input } from '@/shared/ui/shadcn/input';
import { Separator } from '@/shared/ui/shadcn/separator';
import { Skeleton } from '@/shared/ui/shadcn/skeleton';
import { Switch } from '@/shared/ui/shadcn/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/shadcn/tooltip';
import type { PresetField, PresetSchema, PresetValues } from '@shared/types/binds';

function InfoTip({ text }: { text: string }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <CircleHelp className="size-3.5 shrink-0 cursor-help text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent side="top">{text}</TooltipContent>
        </Tooltip>
    );
}

// Local draft string so transient empty / NaN states (mid-typing, mid-clear)
// don't propagate to the persisted value. Empty/invalid drafts revert on blur.
function NumberInput({
    value,
    onChange,
}: {
    value: number;
    onChange: (n: number) => void;
}) {
    const remoteStr = String(value);
    const [draft, setDraft] = useState(remoteStr);

    useEffect(() => {
        setDraft(remoteStr);
    }, [remoteStr]);

    return (
        <Input
            type="number"
            className="h-8 w-24 text-right"
            value={draft}
            onChange={(e) => {
                const raw = e.target.value;
                setDraft(raw);
                const n = Number(raw);
                if (raw !== '' && Number.isFinite(n) && n !== value) onChange(n);
            }}
            onBlur={() => {
                const n = Number(draft);
                if (draft === '' || !Number.isFinite(n)) setDraft(remoteStr);
            }}
        />
    );
}

interface FieldRowProps {
    field: PresetField;
    value: string | number | boolean | undefined;
    onChange: (v: string | number | boolean) => void;
}

function FieldRow({ field, value, onChange }: FieldRowProps) {
    const current = value ?? field.default;
    return (
        <div className="flex items-center justify-between gap-3 py-1.5">
            <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-sm">{field.label}</span>
                {field.tooltip && <InfoTip text={field.tooltip} />}
            </div>
            {field.type === 'hotkey' ? (
                <KeyBindInput
                    value={typeof current === 'string' ? current : String(current)}
                    onChange={(v) => onChange(v)}
                />
            ) : field.type === 'boolean' ? (
                <Switch
                    checked={current === true || current === 'true' || current === 1}
                    onCheckedChange={(v) => onChange(v)}
                />
            ) : field.type === 'number' ? (
                <NumberInput
                    value={typeof current === 'number' && Number.isFinite(current) ? current : 0}
                    onChange={(n) => onChange(n)}
                />
            ) : (
                <Input
                    className="h-8 w-24 text-right"
                    value={typeof current === 'string' ? current : String(current)}
                    onChange={(e) => onChange(e.target.value)}
                />
            )}
        </div>
    );
}

export interface PresetFormProps {
    schema: PresetSchema | null;
    values: PresetValues;
    loading: boolean;
    dirty: boolean;
    saving: boolean;
    onChange: (key: string, v: string | number | boolean) => void;
    onSave: () => void;
    onReset: () => void;
}

export function PresetForm({
    schema,
    values,
    loading,
    dirty,
    saving,
    onChange,
    onSave,
    onReset,
}: PresetFormProps) {
    const t = useT();
    const hasAnyField =
        !!schema &&
        Array.isArray(schema.sections) &&
        schema.sections.some((s) => Array.isArray(s.fields) && s.fields.length > 0);

    return (
        <div className="mx-auto flex h-full w-full max-w-3xl min-h-0 flex-col">
            <Card className="flex h-full min-h-0 w-full flex-col gap-0 py-0">
                <CardContent className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                    {loading ? (
                        <div className="flex flex-col gap-2">
                            {Array.from({ length: 5 }, (_, i) => (
                                <Skeleton key={i} className="h-8" />
                            ))}
                        </div>
                    ) : !hasAnyField ? (
                        <p className="py-4 text-center text-sm text-muted-foreground">
                            {t('binds.schemaEmpty')}
                        </p>
                    ) : (
                        <div className="flex flex-col gap-5">
                            {schema!.sections.map((section) =>
                                section.fields.length === 0 ? null : (
                                    <div key={section.name} className="flex flex-col">
                                        <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                            {section.title}
                                        </h3>
                                        <div className="flex flex-col divide-y divide-border/60">
                                            {section.fields.map((f) => (
                                                <FieldRow
                                                    key={f.key}
                                                    field={f}
                                                    value={values[f.key]}
                                                    onChange={(v) => onChange(f.key, v)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ),
                            )}
                        </div>
                    )}
                </CardContent>
                {hasAnyField && (
                    <>
                        <Separator />
                        <CardFooter className="px-5 py-3">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onReset}
                                disabled={saving}
                            >
                                <RotateCcw data-icon="inline-start" />
                                {t('binds.reset')}
                            </Button>
                            <div className="flex-1" />
                            <Button
                                size="sm"
                                onClick={onSave}
                                disabled={!dirty || saving}
                            >
                                {saving ? (
                                    <Loader2 data-icon="inline-start" className="animate-spin" />
                                ) : (
                                    <Save data-icon="inline-start" />
                                )}
                                {t('binds.save')}
                            </Button>
                        </CardFooter>
                    </>
                )}
            </Card>
        </div>
    );
}
