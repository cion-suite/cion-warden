import { describe, expect, it } from 'vitest';
import { settingsSchema } from '@shared/settings';

describe('settingsSchema', () => {
    it('every key has a default', () => {
        expect(settingsSchema.parse({})).toEqual({
            theme: 'dark',
            locale: 'en',
            telemetryOptIn: false,
        });
    });

    it('keeps stored values over defaults', () => {
        const parsed = settingsSchema.parse({ theme: 'dark', locale: 'ru' });

        expect(parsed).toMatchObject({ theme: 'dark', locale: 'ru' });
    });

    it('refuses an unknown theme or locale', () => {
        expect(settingsSchema.safeParse({ theme: 'blue' }).success).toBe(false);
        expect(settingsSchema.safeParse({ locale: 'de' }).success).toBe(false);
    });
});
