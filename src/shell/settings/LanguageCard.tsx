import { settings, useSetting } from '@cion-suite/core/renderer';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/shadcn/card';
import { Field, FieldGroup, FieldLabel } from '@/ui/shadcn/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/ui/shadcn/select';
import { SUPPORTED_LOCALES, useT } from '@/lib/i18n';

export function LanguageCard() {
    const t = useT();
    const locale = useSetting('locale');

    const select = (value: string) => {
        const next = SUPPORTED_LOCALES.find((code) => code === value);
        if (next) void settings.set('locale', next);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('settings.language.title')}</CardTitle>
                <CardDescription>{t('settings.language.description')}</CardDescription>
            </CardHeader>
            <CardContent>
                <FieldGroup>
                    <Field orientation="responsive">
                        <FieldLabel htmlFor="settings-locale">{t('settings.language.label')}</FieldLabel>
                        <Select value={locale} onValueChange={select}>
                            <SelectTrigger id="settings-locale" className="w-full @md/field-group:w-44">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    {SUPPORTED_LOCALES.map((code) => (
                                        <SelectItem key={code} value={code}>
                                            {t(`locale.name.${code}`)}
                                        </SelectItem>
                                    ))}
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </Field>
                </FieldGroup>
            </CardContent>
        </Card>
    );
}
