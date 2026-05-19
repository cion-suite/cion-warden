import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { useT } from '@/shared/i18n';
import { toast } from '@/shared/lib/toast';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/shadcn/badge';
import { Button } from '@/shared/ui/shadcn/button';
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from '@/shared/ui/shadcn/dialog';
import { Input } from '@/shared/ui/shadcn/input';
import { Switch } from '@/shared/ui/shadcn/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/shadcn/tabs';
import type { VaultSource } from '@shared/types/vault';

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
    return (
        <div
            className={cn(
                'group flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 transition-colors',
                selected
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            )}
            onClick={onSelect}
        >
            {source.type === 'git' && (
                <Badge variant="outline" className="shrink-0 text-xs">GIT</Badge>
            )}
            <span className="min-w-0 flex-1 truncate text-xs">
                {source.type === 'git'
                    ? (source.name.split('/').pop() ?? source.name)
                    : source.name}
            </span>
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
        <div className="flex items-center gap-2 rounded-md bg-accent px-2 py-2 text-accent-foreground">
            <Badge variant="outline" className="shrink-0 text-xs">NEW</Badge>
            <span className="min-w-0 flex-1 truncate text-sm italic text-muted-foreground">
                {t('sources.newSource')}
            </span>
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

// ─── Form-field blocks (shared between settings + new-source) ────────────────

interface GitFormFieldsProps {
    url: string;
    onUrlChange: (v: string) => void;
    branch: string;
    onBranchChange: (v: string) => void;
    isPrivate: boolean;
    onIsPrivateChange: (v: boolean) => void;
    autoFocusUrl?: boolean;
}

function GitFormFields({
    url,
    onUrlChange,
    branch,
    onBranchChange,
    isPrivate,
    onIsPrivateChange,
    autoFocusUrl,
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
        </>
    );
}

interface ExternalFormFieldsProps {
    name: string;
    onNameChange: (v: string) => void;
    scriptsUrl: string;
    onScriptsUrlChange: (v: string) => void;
    libsUrl: string;
    onLibsUrlChange: (v: string) => void;
    cfgUrl: string;
    onCfgUrlChange: (v: string) => void;
    namePlaceholder?: string;
}

function ExternalFormFields({
    name,
    onNameChange,
    scriptsUrl,
    onScriptsUrlChange,
    libsUrl,
    onLibsUrlChange,
    cfgUrl,
    onCfgUrlChange,
    namePlaceholder,
}: ExternalFormFieldsProps) {
    const t = useT();
    return (
        <>
            <FieldRow label={t('sources.name')}>
                <Input
                    className="h-8"
                    value={name}
                    onChange={(e) => onNameChange(e.target.value)}
                    placeholder={namePlaceholder}
                />
            </FieldRow>
            <FieldRow label={t('sources.scriptsUrl')}>
                <Input
                    className="h-8"
                    value={scriptsUrl}
                    onChange={(e) => onScriptsUrlChange(e.target.value)}
                />
            </FieldRow>
            <FieldRow label={t('sources.libsUrl')}>
                <Input
                    className="h-8"
                    value={libsUrl}
                    onChange={(e) => onLibsUrlChange(e.target.value)}
                />
            </FieldRow>
            <FieldRow label={t('sources.cfgUrl')}>
                <Input
                    className="h-8"
                    value={cfgUrl}
                    onChange={(e) => onCfgUrlChange(e.target.value)}
                />
            </FieldRow>
        </>
    );
}

// ─── Right panel: settings for existing source ───────────────────────────────

function GitSettings({
    source,
    onSaved,
}: {
    source: Extract<VaultSource, { type: 'git' }>;
    onSaved: () => void;
}) {
    const t = useT();
    const [url, setUrl] = useState(source.url);
    const [branch, setBranch] = useState(source.branch);
    const [isPrivate, setIsPrivate] = useState(source.isPrivate);
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            await window.app?.sources.update(source.id, { url, branch, isPrivate });
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

function ExternalSettings({
    source,
    onSaved,
}: {
    source: Extract<VaultSource, { type: 'external' }>;
    onSaved: () => void;
}) {
    const t = useT();
    const [name, setName] = useState(source.name);
    const [scriptsUrl, setScriptsUrl] = useState(source.scriptsUrl);
    const [libsUrl, setLibsUrl] = useState(source.libsUrl);
    const [cfgUrl, setCfgUrl] = useState(source.cfgUrl);
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            await window.app?.sources.update(source.id, { name, scriptsUrl, libsUrl, cfgUrl });
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
                <ExternalFormFields
                    name={name}
                    onNameChange={setName}
                    scriptsUrl={scriptsUrl}
                    onScriptsUrlChange={setScriptsUrl}
                    libsUrl={libsUrl}
                    onLibsUrlChange={setLibsUrl}
                    cfgUrl={cfgUrl}
                    onCfgUrlChange={setCfgUrl}
                />
            </div>

            <div className="border-t px-3 py-2">
                <Button
                    size="sm"
                    disabled={saving || !name.trim()}
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
    onSaved,
    onCancel,
}: {
    onSaved: () => void;
    onCancel: () => void;
}) {
    const t = useT();
    const [type, setType] = useState<'git' | 'external'>('git');
    const [url, setUrl] = useState('');
    const [branch, setBranch] = useState('main');
    const [isPrivate, setIsPrivate] = useState(false);
    const [extName, setExtName] = useState('');
    const [scriptsUrl, setScriptsUrl] = useState('');
    const [libsUrl, setLibsUrl] = useState('');
    const [cfgUrl, setCfgUrl] = useState('');
    const [saving, setSaving] = useState(false);

    const canSave = type === 'git' ? url.trim().length > 0 : extName.trim().length > 0;

    const handleSave = async () => {
        setSaving(true);
        try {
            const data =
                type === 'git'
                    ? ({ type: 'git' as const, name: '', url, branch, isPrivate } as const)
                    : ({
                          type: 'external' as const,
                          name: extName,
                          scriptsUrl,
                          libsUrl,
                          cfgUrl,
                      } as const);
            await window.app?.sources.add(data);
            onSaved();
        } catch {
            toast.error(t('error'));
        } finally {
            setSaving(false);
        }
    };

    const gitFields = (
        <div className="flex flex-col divide-y divide-border">
            <GitFormFields
                url={url}
                onUrlChange={setUrl}
                branch={branch}
                onBranchChange={setBranch}
                isPrivate={isPrivate}
                onIsPrivateChange={setIsPrivate}
                autoFocusUrl
            />
        </div>
    );

    const externalFields = (
        <div className="flex flex-col divide-y divide-border">
            <ExternalFormFields
                name={extName}
                onNameChange={setExtName}
                scriptsUrl={scriptsUrl}
                onScriptsUrlChange={setScriptsUrl}
                libsUrl={libsUrl}
                onLibsUrlChange={setLibsUrl}
                cfgUrl={cfgUrl}
                onCfgUrlChange={setCfgUrl}
                namePlaceholder={t('sources.namePlaceholder')}
            />
        </div>
    );

    return (
        <div className="flex h-full flex-col">
            <div className="border-b px-3 py-2.5">
                <p className="text-sm font-semibold">{t('sources.newSource')}</p>
            </div>

            <Tabs
                value={type}
                onValueChange={(v) => setType(v as 'git' | 'external')}
                className="flex min-h-0 flex-1 flex-col"
            >
                <TabsList className="w-full shrink-0 rounded-none border-b">
                    <TabsTrigger value="git" className="flex-1">Git</TabsTrigger>
                    <TabsTrigger value="external" className="flex-1">{t('sources.external')}</TabsTrigger>
                </TabsList>
                <div className="min-h-0 flex-1 overflow-y-auto">
                    <TabsContent value="git" className="mt-0">{gitFields}</TabsContent>
                    <TabsContent value="external" className="mt-0">{externalFields}</TabsContent>
                </div>
            </Tabs>

            <div className="flex gap-2 border-t px-3 py-2">
                <Button variant="ghost" size="sm" onClick={onCancel}>
                    {t('cancel')}
                </Button>
                <Button size="sm" disabled={saving || !canSave} onClick={() => void handleSave()}>
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
    const sourcesRef = useRef(sources);
    sourcesRef.current = sources;

    useEffect(() => {
        if (open) {
            setSelectedId(sourcesRef.current[0]?.id ?? null);
            setAddingNew(false);
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
    };

    const handleNewSaved = () => {
        setAddingNew(false);
        onSourcesChange();
    };

    const handleSaved = () => {
        onSourcesChange();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl gap-0 overflow-hidden p-0">
                <DialogTitle className="sr-only">{t('sources.title')}</DialogTitle>

                <div className="flex h-[min(520px,calc(100dvh-2rem))]">
                    {/* ── Left panel ───────────────────────────────── */}
                    <div className="flex w-[180px] shrink-0 flex-col border-r">
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
                                <NewSourceItem onCancel={() => setAddingNew(false)} />
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
                                onSaved={handleNewSaved}
                                onCancel={() => setAddingNew(false)}
                            />
                        ) : selectedSource ? (
                            selectedSource.type === 'git' ? (
                                <GitSettings
                                    key={selectedSource.id}
                                    source={selectedSource}
                                    onSaved={handleSaved}
                                />
                            ) : (
                                <ExternalSettings
                                    key={selectedSource.id}
                                    source={selectedSource}
                                    onSaved={handleSaved}
                                />
                            )
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
