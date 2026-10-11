import { useState } from 'react';
import { TypeIcon } from 'lucide-react';

import { useT } from '@/lib/i18n';
import { Button } from '@/ui/shadcn/button';
import { toast } from '@/ui/toast';
import type { FontInstall } from '@shared/types';

import { SourceFormFields } from './SourceFormFields';
import type { SourceSettingsProps } from './types';
import { useInvalidateSources } from './useSources';

export function SourceSettings({ source }: SourceSettingsProps) {
    const t = useT();
    const invalidateSources = useInvalidateSources();
    const [url, setUrl] = useState(source.url);
    const [branch, setBranch] = useState(source.branch);
    const [isPrivate, setIsPrivate] = useState(source.isPrivate);
    const [token, setToken] = useState('');
    const [tokenLocked, setTokenLocked] = useState(source.tokenMask !== null);
    const [saving, setSaving] = useState(false);
    const [reinstallingFonts, setReinstallingFonts] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            const updated = await toast.result(window.sources.update(source.id, { url, branch, isPrivate }), {
                error: t('error'),
            });
            const trimmed = token.trim();
            if (updated && isPrivate && trimmed.length > 0 && !tokenLocked) {
                await toast.result(window.sources.token.set(source.id, trimmed), {
                    success: t('sources.tokenSaved'),
                    error: t('sources.tokenSaveError'),
                });
            }
            void invalidateSources();
        } finally {
            setSaving(false);
        }
    };

    const handleReinstallFonts = async () => {
        setReinstallingFonts(true);
        try {
            // Исход разный по failed, поэтому тост итога - в ветке ниже
            let r: FontInstall | undefined;
            const ok = await toast.result(
                window.fonts.install(source.id).then((installed) => {
                    r = installed;
                }),
                { error: t('sources.reinstallFontsError') },
            );
            if (!ok || !r) return;
            if (r.failed > 0) {
                toast.error(t('sources.reinstallFontsWithFails', { ok: r.ok, failed: r.failed }));
            } else {
                toast.success(t('sources.reinstallFontsDone', { ok: r.ok, skipped: r.skipped }));
            }
        } finally {
            setReinstallingFonts(false);
        }
    };

    return (
        <div className="flex h-full flex-col">
            <div className="border-b px-3 py-2.5">
                <p className="truncate text-sm font-semibold">{source.name}</p>
            </div>

            <SourceFormFields
                url={url}
                onUrlChange={setUrl}
                branch={branch}
                onBranchChange={setBranch}
                isPrivate={isPrivate}
                onIsPrivateChange={setIsPrivate}
                token={token}
                onTokenChange={setToken}
                tokenLocked={tokenLocked}
                onUnlock={() => {
                    setTokenLocked(false);
                    setToken('');
                }}
                mask={source.tokenMask}
            />

            <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
                <Button
                    variant="outline"
                    size="sm"
                    disabled={reinstallingFonts}
                    onClick={() => void handleReinstallFonts()}
                >
                    <TypeIcon data-icon="inline-start" />
                    {t('sources.reinstallFonts')}
                </Button>
                <Button size="sm" disabled={saving || !url.trim()} onClick={() => void handleSave()}>
                    {t('sources.save')}
                </Button>
            </div>
        </div>
    );
}
