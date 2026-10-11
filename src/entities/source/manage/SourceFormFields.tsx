import { useId } from 'react';
import { PencilIcon } from 'lucide-react';

import { useT } from '@/lib/i18n';
import { Button } from '@/ui/shadcn/button';
import { Field, FieldGroup, FieldLabel } from '@/ui/shadcn/field';
import { Input } from '@/ui/shadcn/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/ui/shadcn/input-group';
import { Switch } from '@/ui/shadcn/switch';

import type { FieldRowProps, SourceFormFieldsProps } from './types';

function FieldRow({ label, htmlFor, children }: FieldRowProps) {
    return (
        <Field className="gap-1 px-3 py-2">
            <FieldLabel htmlFor={htmlFor} className="text-xs text-muted-foreground">
                {label}
            </FieldLabel>
            {children}
        </Field>
    );
}

export function SourceFormFields({
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
}: SourceFormFieldsProps) {
    const t = useT();
    const id = useId();

    return (
        <FieldGroup className="min-h-0 flex-1 gap-0 divide-y divide-border overflow-y-auto">
            <FieldRow label={t('sources.url')} htmlFor={`${id}-url`}>
                <Input
                    id={`${id}-url`}
                    className="h-8"
                    value={url}
                    onChange={(e) => onUrlChange(e.target.value)}
                    placeholder="https://github.com/user/repo"
                    autoFocus={autoFocusUrl}
                />
            </FieldRow>
            <FieldRow label={t('sources.branch')} htmlFor={`${id}-branch`}>
                <Input
                    id={`${id}-branch`}
                    className="h-8"
                    value={branch}
                    onChange={(e) => onBranchChange(e.target.value)}
                    placeholder="main"
                />
            </FieldRow>
            <Field orientation="horizontal" className="items-center justify-between px-3 py-2">
                <FieldLabel htmlFor={`${id}-private`}>{t('sources.private')}</FieldLabel>
                <Switch id={`${id}-private`} checked={isPrivate} onCheckedChange={onIsPrivateChange} />
            </Field>
            {isPrivate && (
                <FieldRow label={t('sources.token')} htmlFor={`${id}-token`}>
                    <InputGroup>
                        <InputGroupInput
                            id={`${id}-token`}
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
                                    <PencilIcon />
                                </Button>
                            </InputGroupAddon>
                        )}
                    </InputGroup>
                </FieldRow>
            )}
        </FieldGroup>
    );
}
