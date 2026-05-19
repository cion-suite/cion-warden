import { useState, useEffect } from 'react';

import { useT } from '@/shared/i18n';
import { toast } from '@/shared/lib/toast';
import { Button } from '@/shared/ui/shadcn/button';
import { Badge } from '@/shared/ui/shadcn/badge';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/shared/ui/shadcn/dialog';
import {
    Field,
    FieldContent,
    FieldDescription,
    FieldGroup,
    FieldTitle,
} from '@/shared/ui/shadcn/field';
import { Input } from '@/shared/ui/shadcn/input';
import { Switch } from '@/shared/ui/shadcn/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/shadcn/tabs';
import type { ConfigField, ScriptMeta } from '@shared/types/scripts';

interface KeyChipProps {
    value: string;
    onChange: (key: string) => void;
}

function KeyChip({ value, onChange }: KeyChipProps) {
    const t = useT();
    const [recording, setRecording] = useState(false);

    useEffect(() => {
        if (!recording) return;
        const handler = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.key === 'Escape') {
                setRecording(false);
                return;
            }
            onChange(e.key);
            setRecording(false);
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true });
    }, [recording, onChange]);

    return (
        <Badge
            variant={recording ? 'default' : 'secondary'}
            className="min-w-16 cursor-pointer select-none justify-center font-mono"
            onClick={() => setRecording(true)}
        >
            {recording ? t('scripts.configDialog.pressKey') : (value || '—')}
        </Badge>
    );
}

interface ConfigInputProps {
    field: ConfigField;
    value: unknown;
    onChange: (v: unknown) => void;
}

function ConfigInput({ field, value, onChange }: ConfigInputProps) {
    switch (field.type) {
        case 'number':
            return (
                <Input
                    type="number"
                    className="w-28"
                    value={String(value ?? '')}
                    onChange={(e) => onChange(Number(e.target.value))}
                />
            );
        case 'toggle':
            return (
                <Switch
                    checked={Boolean(value)}
                    onCheckedChange={(checked) => onChange(checked)}
                />
            );
        default:
            return (
                <Input
                    className="w-48"
                    value={String(value ?? '')}
                    onChange={(e) => onChange(e.target.value)}
                />
            );
    }
}

export interface ScriptConfigDialogProps {
    script: ScriptMeta;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ScriptConfigDialog({ script, open, onOpenChange }: ScriptConfigDialogProps) {
    const t = useT();
    const [values, setValues] = useState<Record<string, unknown>>({});

    const fields = script.config?.fields ?? [];
    const hotkeyFields = fields.filter((f) => f.type === 'hotkey');
    const valueFields = fields.filter((f) => f.type !== 'hotkey');

    useEffect(() => {
        if (!open || !script.configPath) return;
        const allFields = script.config?.fields ?? [];
        const defaults: Record<string, unknown> = Object.fromEntries(
            allFields.map((f) => [f.key, f.default]),
        );
        window.app?.scripts.getConfigValues(script.configPath).then((saved) => {
            setValues({ ...defaults, ...saved });
        });
    }, [open, script.configPath, script.config?.fields]);

    const setValue = (key: string, val: unknown) =>
        setValues((prev) => ({ ...prev, [key]: val }));

    const handleSave = async () => {
        if (!script.configPath) return;
        try {
            await window.app?.scripts.saveConfigValues(script.configPath, values);
            onOpenChange(false);
        } catch {
            toast.error(t('error'));
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        {script.config?.name ?? script.name} — {t('scripts.configDialog.title')}
                    </DialogTitle>
                </DialogHeader>

                <Tabs defaultValue={hotkeyFields.length > 0 ? 'hotkeys' : 'values'}>
                    <TabsList className="w-full">
                        <TabsTrigger value="hotkeys" disabled={hotkeyFields.length === 0} className="flex-1">
                            {t('scripts.configDialog.hotkeys')}
                        </TabsTrigger>
                        <TabsTrigger value="values" disabled={valueFields.length === 0} className="flex-1">
                            {t('scripts.configDialog.values')}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="hotkeys" className="mt-4">
                        <FieldGroup>
                            {hotkeyFields.map((field) => (
                                <Field key={field.key} orientation="responsive">
                                    <FieldContent>
                                        <FieldTitle>{field.label}</FieldTitle>
                                        {field.description && (
                                            <FieldDescription>{field.description}</FieldDescription>
                                        )}
                                    </FieldContent>
                                    <KeyChip
                                        value={String(values[field.key] ?? field.default ?? '')}
                                        onChange={(k) => setValue(field.key, k)}
                                    />
                                </Field>
                            ))}
                        </FieldGroup>
                    </TabsContent>

                    <TabsContent value="values" className="mt-4">
                        <FieldGroup>
                            {valueFields.map((field) => (
                                <Field key={field.key} orientation="responsive">
                                    <FieldContent>
                                        <FieldTitle>{field.label}</FieldTitle>
                                        {field.description && (
                                            <FieldDescription>{field.description}</FieldDescription>
                                        )}
                                    </FieldContent>
                                    <ConfigInput
                                        field={field}
                                        value={values[field.key] ?? field.default}
                                        onChange={(v) => setValue(field.key, v)}
                                    />
                                </Field>
                            ))}
                        </FieldGroup>
                    </TabsContent>
                </Tabs>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={() => void handleSave()}>
                        {t('scripts.configDialog.save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
