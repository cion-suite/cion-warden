import { useEffect, useState } from 'react';
import { CircleHelp } from 'lucide-react';

import { useT } from '@/shared/i18n';
import { toast } from '@/shared/lib/toast';
import { KeyBindInput } from '@/shared/ui/key-bind-input';
import { Button } from '@/shared/ui/shadcn/button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/shared/ui/shadcn/dialog';
import { Input } from '@/shared/ui/shadcn/input';
import { Switch } from '@/shared/ui/shadcn/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/shadcn/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/shadcn/tooltip';
import type { ScriptCfgValues, ScriptMeta } from '@shared/types/scripts';

function buildDefaults(config: ScriptMeta['config']): ScriptCfgValues {
    return {
        hk: Object.fromEntries(
            Object.entries(config?.hk ?? {}).map(([k, e]) => [k, e.key]),
        ),
        val: Object.fromEntries(
            Object.entries(config?.val ?? {}).map(([k, e]) => [k, e.val]),
        ),
    };
}

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

export interface ScriptConfigDialogProps {
    script: ScriptMeta;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ScriptConfigDialog({ script, open, onOpenChange }: ScriptConfigDialogProps) {
    const t = useT();
    const [values, setValues] = useState<ScriptCfgValues>({ hk: {}, val: {} });

    const { hk: cfgHk = {}, val: cfgVal = {} } = script.config ?? {};
    const hkEntries = Object.entries(cfgHk);
    const valEntries = Object.entries(cfgVal);

    useEffect(() => {
        if (!open || !script.configPath) return;
        const defaults = buildDefaults(script.config);
        window.app?.scripts
            .getConfigValues(script.configPath)
            .then((saved) => {
                setValues({
                    hk: { ...defaults.hk, ...(saved.hk ?? {}) },
                    val: { ...defaults.val, ...(saved.val ?? {}) },
                });
            })
            .catch(() => {
                setValues(defaults);
                toast.error(t('error'));
            });
    }, [open, script.configPath, script.config, t]);

    const setHk = (key: string, v: string) =>
        setValues((prev) => ({ ...prev, hk: { ...prev.hk, [key]: v } }));

    const setVal = (key: string, v: string | number | boolean) =>
        setValues((prev) => ({ ...prev, val: { ...prev.val, [key]: v } }));

    const handleSave = async () => {
        if (!script.configPath) return;
        try {
            await window.app?.scripts.saveConfigValues(script.configPath, values);
            onOpenChange(false);
        } catch {
            toast.error(t('error'));
        }
    };

    const defaultTab = hkEntries.length > 0 ? 'hotkeys' : 'values';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>{script.name} — {t('scripts.configDialog.title')}</DialogTitle>
                </DialogHeader>

                <Tabs defaultValue={defaultTab}>
                    <TabsList className="w-full">
                        <TabsTrigger
                            value="hotkeys"
                            disabled={hkEntries.length === 0}
                            className="flex-1"
                        >
                            {t('scripts.configDialog.hotkeys')}
                        </TabsTrigger>
                        <TabsTrigger
                            value="values"
                            disabled={valEntries.length === 0}
                            className="flex-1"
                        >
                            {t('scripts.configDialog.values')}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="hotkeys">
                        <div className="flex max-h-[min(50vh,320px)] flex-col divide-y divide-border overflow-y-auto">
                            {hkEntries.map(([key, entry]) => (
                                <div
                                    key={key}
                                    className="flex items-center justify-between gap-3 px-1 py-2.5"
                                >
                                    <div className="flex min-w-0 items-center gap-1.5">
                                        <span className="truncate text-sm">{entry.description}</span>
                                        {entry.tooltip && <InfoTip text={entry.tooltip} />}
                                    </div>
                                    <KeyBindInput
                                        value={values.hk[key] ?? entry.key}
                                        onChange={(v) => setHk(key, v)}
                                    />
                                </div>
                            ))}
                        </div>
                    </TabsContent>

                    <TabsContent value="values">
                        <div className="flex max-h-[min(50vh,320px)] flex-col divide-y divide-border overflow-y-auto">
                            {valEntries.map(([key, entry]) => {
                                const current = values.val[key] ?? entry.val;
                                return (
                                    <div
                                        key={key}
                                        className="flex items-center justify-between gap-3 px-1 py-2.5"
                                    >
                                        <div className="flex min-w-0 items-center gap-1.5">
                                            <span className="truncate text-sm">{entry.description}</span>
                                            {entry.tooltip && <InfoTip text={entry.tooltip} />}
                                        </div>
                                        {typeof entry.val === 'boolean' ? (
                                            <Switch
                                                checked={current === true}
                                                onCheckedChange={(v) => setVal(key, v)}
                                            />
                                        ) : typeof entry.val === 'number' ? (
                                            <Input
                                                type="number"
                                                className="h-8 w-24 text-right"
                                                value={String(current)}
                                                onChange={(e) =>
                                                    setVal(key, Number(e.target.value))
                                                }
                                            />
                                        ) : (
                                            <Input
                                                className="h-8 w-24 text-right"
                                                value={String(current)}
                                                onChange={(e) => setVal(key, e.target.value)}
                                            />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
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
