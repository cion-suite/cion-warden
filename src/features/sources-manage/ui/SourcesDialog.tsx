import { useState, useEffect, useRef } from 'react';
import { Lock, Pencil, Plus, Trash2 } from 'lucide-react';

import { useT } from '@/shared/i18n';
import { toast } from '@/shared/lib/toast';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/shadcn/button';
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from '@/shared/ui/shadcn/dialog';
import { Input } from '@/shared/ui/shadcn/input';
import {
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
} from '@/shared/ui/shadcn/input-group';
import { Switch } from '@/shared/ui/shadcn/switch';
import type { VaultSource } from '@shared/types/vault';
import { deriveGitName } from '@shared/utils/github-url';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1 px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            {children}
        </div>
    );
}

// ─── Left panel item ─────────────────────────────────────────────────────────

function SourceItem({
    source,
    selected,
    onSelect,
    onDelete,
}: {
    source: VaultSource;
    selected: boolean;
    onSelect: () => void;
    onDelete: () => void;
}) {
    const t = useT();
    const title = source.name.split('/').pop() ?? source.name;

    return (
        <div
            className={cn(
                'group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors',
                selected
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50',
            )}
            onClick={onSelect}
        >
            <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{title}</span>
                <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    {source.isPrivate && <Lock className="size-3" />}
                    <span>
                        GIT
                        {source.isPrivate ? ` · ${t('sources.private').toLowerCase()}` : ''}
                    </span>
                </span>
            </div>
            <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0 opacity-0 group-hover:opacity-100"
                onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                }}
            >
                <Trash2 />
            </Button>
        </div>
    );
}

function NewSourceItem({ onCancel }: { onCancel: () => void }) {
    const t = useT();
    return (
        <div className="group flex items-center gap-2 rounded-md bg-accent px-2 py-1.5 text-accent-foreground">
            <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium italic text-muted-foreground">
                    {t('sources.newShort')}
                </span>
                <span className="truncate text-xs text-muted-foreground">GIT</span>
            </div>
            <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0"
                onClick={onCancel}
            >
                <Trash2 />
            </Button>
        </div>
    );
}

// ─── Form-field block ────────────────────────────────────────────────────────

interface GitFormFieldsProps {
    url: string;
    onUrlChange: (v: string) => void;
    branch: string;
    onBranchChange: (v: string) => void;
    isPrivate: boolean;
    onIsPrivateChange: (v: boolean) => void;
    autoFocusUrl?: boolean;
    token: string;
    onTokenChange: (v: string) => void;
    tokenLocked: boolean;
    onUnlock: () => void;
    mask: string | null;
}

function GitFormFields({
    url,
    onUrlChange,
    branch,
    onBranchChange,
    isPrivate,
    onIsPrivateChange,
    autoFocusUrl,
    token,
    onTokenChange,
    tokenLocked,
    onUnlock,
    mask,
}: GitFormFieldsProps) {
    const t = useT();
    return (
        <>
            <FieldRow label={t('sources.url')}>
                <Input
                    className="h-8"
                    value={url}
                    onChange={(e) => onUrlChange(e.target.value)}
                    placeholder="https://github.com/user/repo"
                    autoFocus={autoFocusUrl}
                />
            </FieldRow>
            <FieldRow label={t('sources.branch')}>
                <Input
                    className="h-8"
                    value={branch}
                    onChange={(e) => onBranchChange(e.target.value)}
                    placeholder="main"
                />
            </FieldRow>
            <div className="flex items-center justify-between px-3 py-2">
                <span className="text-sm font-medium">{t('sources.private')}</span>
                <Switch checked={isPrivate} onCheckedChange={onIsPrivateChange} />
            </div>
            {isPrivate && (
                <FieldRow label={t('sources.token')}>
                    <InputGroup>
                        <InputGroupInput
                            type={tokenLocked ? 'text' : 'password'}
                            disabled={tokenLocked}
                            value={tokenLocked ? (mask ?? '') : token}
                            onChange={(e) => onTokenChange(e.target.value)}
                            placeholder={t('sources.tokenPlaceholder')}
                            autoComplete="off"
                            spellCheck={false}
                        />
                        {tokenLocked && (
                            <InputGroupAddon align="inline-end">
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={t('sources.tokenChange')}
                                    title={t('sources.tokenChange')}
                                    onClick={onUnlock}
                                >
                                    <Pencil />
                                </Button>
                            </InputGroupAddon>
                        )}
                    </InputGroup>
                </FieldRow>
            )}
        </>
    );
}

// ─── Right panel: settings for existing source ───────────────────────────────

function GitSettings({
    source,
    onSaved,
}: {
    source: VaultSource;
    onSaved: () => void;
}) {
    const t = useT();
    const [url, setUrl] = useState(source.url);
    const [branch, setBranch] = useState(source.branch);
    const [isPrivate, setIsPrivate] = useState(source.isPrivate);
    const [token, setToken] = useState('');
    const [tokenLocked, setTokenLocked] = useState(source.hasToken ?? false);
    const [mask, setMask] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (source.hasToken) {
            void window.app?.sources.getTokenMask(source.id).then(setMask);
        } else {
            setMask(null);
        }
    }, [source.id, source.hasToken]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await window.app?.sources.update(source.id, { url, branch, isPrivate });
            const trimmed = token.trim();
            if (isPrivate && trimmed.length > 0 && !tokenLocked) {
                try {
                    await window.app?.sources.setToken(source.id, trimmed);
                    toast.success(t('sources.tokenSaved'));
                } catch {
                    toast.error(t('sources.tokenSaveError'));
                    return;
                }
            }
            onSaved();
        } catch {
            toast.error(t('error'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex h-full flex-col">
            <div className="border-b px-3 py-2.5">
                <p className="truncate text-sm font-semibold">{source.name}</p>
            </div>

            <div className="flex min-h-0 flex-1 flex-col divide-y divide-border overflow-y-auto">
                <GitFormFields
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
                    mask={mask}
                />
            </div>

            <div className="border-t px-3 py-2">
                <Button
                    size="sm"
                    disabled={saving || !url.trim()}
                    onClick={() => void handleSave()}
                >
                    {t('sources.save')}
                </Button>
            </div>
        </div>
    );
}

// ─── Right panel: new source form ────────────────────────────────────────────

function NewSourcePanel({
    url,
    onUrlChange,
    onSaved,
    onCancel,
}: {
    url: string;
    onUrlChange: (v: string) => void;
    onSaved: () => void;
    onCancel: () => void;
}) {
    const t = useT();
    const [branch, setBranch] = useState('main');
    const [isPrivate, setIsPrivate] = useState(false);
    const [token, setToken] = useState('');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            const data = { type: 'git' as const, name: '', url, branch, isPrivate } as const;
            const created = await window.app?.sources.add(data);
            const trimmed = token.trim();
            if (created && isPrivate && trimmed.length > 0) {
                try {
                    await window.app?.sources.setToken(created.id, trimmed);
                    toast.success(t('sources.tokenSaved'));
                } catch {
                    toast.error(t('sources.tokenSaveError'));
                    return;
                }
            }
            onSaved();
        } catch {
            toast.error(t('error'));
        } finally {
            setSaving(false);
        }
    };

    const trimmedUrl = url.trim();
    const derivedName = trimmedUrl.length > 0 ? deriveGitName(trimmedUrl) : '';

    return (
        <div className="flex h-full flex-col">
            <div className="border-b px-3 py-2.5">
                <p className="truncate text-sm font-semibold">
                    {derivedName || (
                        <span className="italic text-muted-foreground">
                            {t('sources.newSource')}
                        </span>
                    )}
                </p>
            </div>

            <div className="flex min-h-0 flex-1 flex-col divide-y divide-border overflow-y-auto">
                <GitFormFields
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
            </div>

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

// ─── Main component ───────────────────────────────────────────────────────────

interface SourcesDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    sources: VaultSource[];
    onSourcesChange: () => void;
}

export function SourcesDialog({
    open,
    onOpenChange,
    sources,
    onSourcesChange,
}: SourcesDialogProps) {
    const t = useT();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [addingNew, setAddingNew] = useState(false);
    const [newUrl, setNewUrl] = useState('');
    const sourcesRef = useRef(sources);
    sourcesRef.current = sources;

    useEffect(() => {
        if (open) {
            setSelectedId(sourcesRef.current[0]?.id ?? null);
            setAddingNew(false);
            setNewUrl('');
        }
    }, [open]);

    useEffect(() => {
        if (selectedId && !sources.find((s) => s.id === selectedId)) {
            setSelectedId(null);
        }
    }, [sources, selectedId]);

    const selectedSource = sources.find((s) => s.id === selectedId) ?? null;

    const handleDelete = async (source: VaultSource) => {
        try {
            await window.app?.sources.remove(source.id);
            if (selectedId === source.id) setSelectedId(null);
            onSourcesChange();
        } catch {
            toast.error(t('error'));
        }
    };

    const handleAddSource = () => {
        setSelectedId(null);
        setAddingNew(true);
        setNewUrl('');
    };

    const handleNewCancel = () => {
        setAddingNew(false);
        setNewUrl('');
    };

    const handleNewSaved = () => {
        setAddingNew(false);
        setNewUrl('');
        onSourcesChange();
    };

    const handleSaved = () => {
        onSourcesChange();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl gap-0 overflow-hidden p-0">
                <DialogTitle className="sr-only">{t('sources.title')}</DialogTitle>

                <div className="flex h-[min(520px,calc(100dvh-2rem))]">
                    {/* ── Left panel ───────────────────────────────── */}
                    <div className="flex w-[220px] shrink-0 flex-col border-r">
                        <div className="border-b px-3 py-2.5 text-sm font-semibold">
                            {t('sources.title')}
                        </div>

                        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
                            {sources.map((source) => (
                                <SourceItem
                                    key={source.id}
                                    source={source}
                                    selected={!addingNew && selectedId === source.id}
                                    onSelect={() => {
                                        setAddingNew(false);
                                        setSelectedId(source.id);
                                    }}
                                    onDelete={() => void handleDelete(source)}
                                />
                            ))}
                            {addingNew && (
                                <NewSourceItem onCancel={handleNewCancel} />
                            )}
                        </div>

                        <div className="border-t p-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start"
                                onClick={handleAddSource}
                            >
                                <Plus data-icon="inline-start" />
                                {t('sources.add')}
                            </Button>
                        </div>
                    </div>

                    {/* ── Right panel ──────────────────────────────── */}
                    <div className="flex min-w-0 flex-1 flex-col">
                        {addingNew ? (
                            <NewSourcePanel
                                url={newUrl}
                                onUrlChange={setNewUrl}
                                onSaved={handleNewSaved}
                                onCancel={handleNewCancel}
                            />
                        ) : selectedSource ? (
                            <GitSettings
                                key={selectedSource.id}
                                source={selectedSource}
                                onSaved={handleSaved}
                            />
                        ) : (
                            <div className="flex flex-1 items-center justify-center">
                                <p className="text-sm text-muted-foreground">
                                    {t('sources.selectSource')}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
