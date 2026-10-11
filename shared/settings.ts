import { z } from 'zod';

/** Схема настроек: источник типа и дефолтов. */
export const settingsSchema = z.object({
    theme: z.enum(['light', 'dark', 'system']).default('dark'),
    locale: z.enum(['en', 'ru']).default('en'),
    telemetryOptIn: z.boolean().default(false),
});

declare module '@cion-suite/core' {
    interface Register {
        settings: typeof settingsSchema;
    }
}

export type AppSettings = z.output<typeof settingsSchema>;
export type Theme = AppSettings['theme'];
export type Locale = AppSettings['locale'];
