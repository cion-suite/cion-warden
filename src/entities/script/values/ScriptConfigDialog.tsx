import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { InfoTip } from '@/ui/InfoTip';
import { KeyBindInput } from '@/ui/KeyBindInput';
import { Button } from '@/ui/shadcn/button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/ui/shadcn/dialog';
import { Input } from '@/ui/shadcn/input';
import { Switch } from '@/ui/shadcn/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/shadcn/tabs';
import { toast } from '@/ui/toast';
import { useT } from '@/lib/i18n';
import type { ScriptCfgValues } from '@shared/types/scripts';
import { configValues } from './config-values';
import type { ScriptConfigDialogProps, ScriptConfigFormProps, ValueRowProps } from './types';

function ValueRow({ description, tooltip, children }: ValueRowProps) {
    return (
        <div className="flex items-center justify-between gap-3 px-1 py-2.5">
            <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-sm">{description}</span>
                {tooltip && <InfoTip text={tooltip} />}
            </div>
            {children}
        </div>
    );
}

// Монтируется заново на каждое открытие,
// поэтому правки не переживают закрытие
function ScriptConfigForm({ script, configPath, onClose }: ScriptConfigFormProps) {
    const t = useT();
    const queryClient = useQueryClient();
    const [edits, setEdits] = useState<ScriptCfgValues>({ hk: {}, val: {} });

    // Файл правят снаружи: читаем на каждое открытие
    const { data: saved, isPending, error } = useQuery({
        queryKey: ['scripts:config:get', configPath],
        queryFn: () => window.scripts.config.get(configPath),
        staleTime: 0,
        retry: false,
    });

    useEffect(() => {
        if (error) toast.error(t('error'), { cause: error });
    }, [error, t]);

    const { hk: cfgHk = {}, val: cfgVal = {} } = script.config ?? {};
    const hkEntries = Object.entries(cfgHk);
    const valEntries = Object.entries(cfgVal);

    const values = configValues.merge(configValues.merge(configValues.defaults(script.config), saved ?? {}), edits);

    const setHk = (key: string, v: string) =>
        setEdits((prev) => ({ ...prev, hk: { ...prev.hk, [key]: v } }));

    const setVal = (key: string, v: string | number | boolean) =>
        setEdits((prev) => ({ ...prev, val: { ...prev.val, [key]: v } }));

    const save = async () => {
        const ok = await toast.result(window.scripts.config.save(configPath, values), {
            error: t('error'),
        });
        if (!ok) return;
        queryClient.setQueryData(['scripts:config:get', configPath], values);
        onClose();
    };

    return (
        <>
            <DialogHeader>
                <DialogTitle>
                    {script.name} - {t('scripts.configDialog.title')}
                </DialogTitle>
            </DialogHeader>

            <Tabs defaultValue={hkEntries.length > 0 ? 'hotkeys' : 'values'}>
                <TabsList className="w-full">
                    <TabsTrigger value="hotkeys" disabled={hkEntries.length === 0} className="flex-1">
                        {t('scripts.configDialog.hotkeys')}
                    </TabsTrigger>
                    <TabsTrigger value="values" disabled={valEntries.length === 0} className="flex-1">
                        {t('scripts.configDialog.values')}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="hotkeys">
                    <div className="flex max-h-[min(50vh,320px)] flex-col divide-y divide-border overflow-y-auto">
                        {hkEntries.map(([key, entry]) => (
                            <ValueRow key={key} description={entry.description} tooltip={entry.tooltip}>
                                <KeyBindInput
                                    value={values.hk[key] ?? entry.key}
                                    onChange={(v) => setHk(key, v)}
                                />
                            </ValueRow>
                        ))}
                    </div>
                </TabsContent>

                <TabsContent value="values">
                    <div className="flex max-h-[min(50vh,320px)] flex-col divide-y divide-border overflow-y-auto">
                        {valEntries.map(([key, entry]) => {
                            const current = values.val[key] ?? entry.val;
                            return (
                                <ValueRow key={key} description={entry.description} tooltip={entry.tooltip}>
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
                                            onChange={(e) => setVal(key, Number(e.target.value))}
                                        />
                                    ) : (
                                        <Input
                                            className="h-8 w-24 text-right"
                                            value={String(current)}
                                            onChange={(e) => setVal(key, e.target.value)}
                                        />
                                    )}
                                </ValueRow>
                            );
                        })}
                    </div>
                </TabsContent>
            </Tabs>

            <DialogFooter>
                <Button variant="ghost" onClick={onClose}>
                    {t('cancel')}
                </Button>
                <Button disabled={isPending} onClick={() => void save()}>
                    {t('scripts.configDialog.save')}
                </Button>
            </DialogFooter>
        </>
    );
}

export function ScriptConfigDialog({ script, open, onOpenChange }: ScriptConfigDialogProps) {
    const { configPath } = script;
    if (!configPath) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm" aria-describedby={undefined}>
                <ScriptConfigForm
                    script={script}
                    configPath={configPath}
                    onClose={() => onOpenChange(false)}
                />
            </DialogContent>
        </Dialog>
    );
}
