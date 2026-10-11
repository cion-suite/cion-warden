import { describe, expect, it } from 'vitest';
import { settingsSchema } from '@shared/settings';

describe('settingsSchema', () => {
    it('every key has a default', () => {
        expect(settingsSchema.parse({})).toEqual({
            theme: 'dark',
            locale: 'en',
            telemetryOptIn: false,
            updaterBeta: false,
        });
    });

    it('keeps stored values over defaults', () => {
        const parsed = settingsSchema.parse({ theme: 'dark', locale: 'ru', updaterBeta: true });

        expect(parsed).toMatchObject({ theme: 'dark', locale: 'ru', updaterBeta: true });
    });

    it('refuses an unknown theme or locale', () => {
        expect(settingsSchema.safeParse({ theme: 'blue' }).success).toBe(false);
        expect(settingsSchema.safeParse({ locale: 'de' }).success).toBe(false);
    });

    it('refuses a non-boolean channel flag', () => {
        expect(settingsSchema.safeParse({ updaterBeta: 'beta' }).success).toBe(false);
    });
});
