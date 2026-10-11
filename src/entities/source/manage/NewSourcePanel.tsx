import { useState } from 'react';

import { useT } from '@/lib/i18n';
import { Button } from '@/ui/shadcn/button';
import { toast } from '@/ui/toast';
import { repo } from '@shared/repo';
import type { Source } from '@shared/types';

import { SourceFormFields } from './SourceFormFields';
import type { NewSourcePanelProps } from './types';
import { useInvalidateSources } from './useSources';

export function NewSourcePanel({ url, onUrlChange, onSaved, onCancel }: NewSourcePanelProps) {
    const t = useT();
    const invalidateSources = useInvalidateSources();
    const [branch, setBranch] = useState('main');
    const [isPrivate, setIsPrivate] = useState(false);
    const [token, setToken] = useState('');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            let created: Source | undefined;
            const added = await toast.result(
                window.sources.add({ type: 'git', url, branch, isPrivate }).then((source) => {
                    created = source;
                }),
                { error: t('error') },
            );
            if (!added || !created) return;
            const trimmed = token.trim();
            if (isPrivate && trimmed.length > 0) {
                await toast.result(window.sources.token.set(created.id, trimmed), {
                    success: t('sources.tokenSaved'),
                    error: t('sources.tokenSaveError'),
                });
            }
            // Источник создан: повтор токена идёт через его настройки
            void invalidateSources();
            onSaved(created.id);
        } finally {
            setSaving(false);
        }
    };

    const trimmedUrl = url.trim();
    const derivedName = trimmedUrl.length > 0 ? repo.name(trimmedUrl) : '';

    return (
        <div className="flex h-full flex-col">
            <div className="border-b px-3 py-2.5">
                <p className="truncate text-sm font-semibold">
                    {derivedName || <span className="italic text-muted-foreground">{t('sources.newSource')}</span>}
                </p>
            </div>

            <SourceFormFields
                url={url}
                onUrlChange={onUrlChange}
                branch={branch}
                onBranchChange={setBranch}
                isPrivate={isPrivate}
                onIsPrivateChange={setIsPrivate}
                autoFocusUrl
                token={token}
                onTokenChange={setToken}
                tokenLocked={false}
                onUnlock={() => undefined}
                mask={null}
            />

            <div className="flex gap-2 border-t px-3 py-2">
                <Button variant="ghost" size="sm" onClick={onCancel}>
                    {t('cancel')}
                </Button>
                <Button size="sm" disabled={saving || !url.trim()} onClick={() => void handleSave()}>
                    {t('sources.save')}
                </Button>
            </div>
        </div>
    );
}
