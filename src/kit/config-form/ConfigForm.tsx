import { ConfigFieldRow } from './ConfigFieldRow';
import type { ConfigFormProps } from './types';

/** Секции полей схемы; значения и сохранение - у вызывающего. */
export function ConfigForm({ schema, values, onChange }: ConfigFormProps) {
    const sections = schema.sections.filter((section) => section.fields.length > 0);

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
