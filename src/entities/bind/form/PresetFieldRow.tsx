import { useState } from 'react';

import { Input } from '@/ui/shadcn/input';
import { Switch } from '@/ui/shadcn/switch';
import { InfoTip } from '@/ui/InfoTip';
import { KeyBindInput } from '@/ui/KeyBindInput';
import type { NumberInputProps, PresetFieldRowProps } from './types';

// Пустой ввод не уходит в значение, на blur откат.
function NumberInput({ value, onChange }: NumberInputProps) {
    const [draft, setDraft] = useState<string | null>(null);

    return (
        <Input
            type="number"
            className="h-8 w-27 text-right"
            value={draft ?? String(value)}
            onChange={(e) => {
                const raw = e.target.value;
                setDraft(raw);
                const n = Number(raw);
                if (raw !== '' && Number.isFinite(n) && n !== value) onChange(n);
            }}
            onBlur={() => setDraft(null)}
        />
    );
}

export function PresetFieldRow({ field, value, onChange }: PresetFieldRowProps) {
    const current = value ?? field.default;
    return (
        <div className="flex items-center justify-between gap-3 py-1.5">
            <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-sm">{field.label}</span>
                {field.tooltip && <InfoTip text={field.tooltip} />}
            </div>
            {field.type === 'hotkey' ? (
                <KeyBindInput value={typeof current === 'string' ? current : String(current)} onChange={onChange} />
            ) : field.type === 'boolean' ? (
                <Switch
                    checked={current === true || current === 'true' || current === 1}
                    onCheckedChange={onChange}
                />
            ) : field.type === 'number' ? (
                <NumberInput
                    value={typeof current === 'number' && Number.isFinite(current) ? current : 0}
                    onChange={onChange}
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
