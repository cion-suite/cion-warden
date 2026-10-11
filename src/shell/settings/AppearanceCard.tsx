import { settings, useSetting } from '@cion-suite/core/renderer';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/shadcn/card';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldTitle } from '@/ui/shadcn/field';
import { ToggleGroup, ToggleGroupItem } from '@/ui/shadcn/toggle-group';
import { THEME_OPTIONS } from '@/ui/theme';
import { useT } from '@/lib/i18n';

export function AppearanceCard() {
    const t = useT();
    const theme = useSetting('theme');

    const select = (value: string) => {
        const next = THEME_OPTIONS.find((option) => option.value === value);
        if (next) void settings.set('theme', next.value);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('settings.appearance.title')}</CardTitle>
                <CardDescription>{t('settings.appearance.description')}</CardDescription>
            </CardHeader>
            <CardContent>
                <FieldGroup>
                    <Field orientation="responsive">
                        <FieldContent>
                            <FieldTitle id="settings-theme">{t('settings.appearance.theme.label')}</FieldTitle>
                            <FieldDescription>{t('settings.appearance.theme.description')}</FieldDescription>
                        </FieldContent>
                        <ToggleGroup
                            type="single"
                            variant="outline"
                            size="sm"
                            spacing={0}
                            aria-labelledby="settings-theme"
                            value={theme}
                            onValueChange={select}
                        >
                            {THEME_OPTIONS.map(({ value, icon: Icon }) => (
                                <ToggleGroupItem key={value} value={value}>
                                    <Icon data-icon="inline-start" />
                                    {t(`theme.${value}`)}
                                </ToggleGroupItem>
                            ))}
                        </ToggleGroup>
                    </Field>
                </FieldGroup>
            </CardContent>
        </Card>
    );
}
