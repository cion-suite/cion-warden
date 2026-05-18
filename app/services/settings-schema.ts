import { z } from 'zod';

// Bumping `currentVersion` in `boot.ts:createSettingsStore` requires a matching
// `migrations` entry — otherwise stored data from older shapes is silently dropped.
export const settingsSchema = z.object({
    theme: z.enum(['light', 'dark', 'system']).default('system'),
    locale: z.enum(['en', 'ru']).default('en'),
    telemetryOptIn: z.boolean().default(false),
});
