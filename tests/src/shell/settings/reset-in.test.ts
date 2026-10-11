import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';

import { resetIn } from '@/shell/settings/reset-in';

// Ключ и параметры вместо перевода: сверяем ветку и числа
const t = ((key: string, params?: Record<string, number>) =>
    params ? `${key} ${JSON.stringify(params)}` : key) as unknown as TFunction;

const NOW = 1_000_000_000_000;
const at = (deltaSec: number) => NOW / 1000 + deltaSec;

describe('resetIn: время до сброса лимита', () => {
    it('сброс в прошлом или сейчас -> resetNow', () => {
        expect(resetIn(t, at(0), NOW)).toBe('settings.github.resetNow');
        expect(resetIn(t, at(-30), NOW)).toBe('settings.github.resetNow');
    });

    it('меньше минуты -> секунды', () => {
        expect(resetIn(t, at(45), NOW)).toBe('settings.github.resetInSeconds {"seconds":45}');
    });

    it('минуты с остатком секунд', () => {
        expect(resetIn(t, at(185), NOW)).toBe('settings.github.resetInMinutes {"minutes":3,"seconds":5}');
    });

    it('граница часа: 60 минут -> часы', () => {
        expect(resetIn(t, at(3600), NOW)).toBe('settings.github.resetInHours {"hours":1,"minutes":0}');
        expect(resetIn(t, at(3599), NOW)).toBe('settings.github.resetInMinutes {"minutes":59,"seconds":59}');
    });

    it('часы и минуты', () => {
        expect(resetIn(t, at(2 * 3600 + 7 * 60 + 30), NOW)).toBe(
            'settings.github.resetInHours {"hours":2,"minutes":7}',
        );
    });
});
