import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/shadcn/tabs';
import { useT } from '@/lib/i18n';
import { ConfigFieldRow } from './ConfigFieldRow';
import { configValues } from './config-values';
import type { ConfigFormProps, ConfigSectionsProps } from './types';

function ConfigSections({ sections, values, onChange }: ConfigSectionsProps) {
    return (
        <div className="flex flex-col gap-5">
            {sections.map((section, index) => (
                <div key={index} className="flex flex-col">
                    {section.title && (
                        <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {section.title}
                        </h3>
                    )}
                    <div className="flex flex-col divide-y divide-border/60">
                        {section.fields.map((field) => (
                            <ConfigFieldRow
                                key={field.key}
                                field={field}
                                value={values[field.key]}
                                onChange={(value) => onChange(field.key, value)}
                            />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

/** Табы значений и биндов; одна группа пуста - без табов. */
export function ConfigForm({ schema, values, onChange }: ConfigFormProps) {
    const t = useT();
    const split = configValues.split(schema);

    if (split.values.length === 0 || split.binds.length === 0) {
        const sections = split.values.length > 0 ? split.values : split.binds;
        return <ConfigSections sections={sections} values={values} onChange={onChange} />;
    }

    return (
        <Tabs defaultValue="values">
            <TabsList>
                <TabsTrigger value="values">{t('config.values')}</TabsTrigger>
                <TabsTrigger value="binds">{t('config.binds')}</TabsTrigger>
            </TabsList>
            <TabsContent value="values">
                <ConfigSections sections={split.values} values={values} onChange={onChange} />
            </TabsContent>
            <TabsContent value="binds">
                <ConfigSections sections={split.binds} values={values} onChange={onChange} />
            </TabsContent>
        </Tabs>
    );
}
