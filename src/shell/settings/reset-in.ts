import type { TFunction } from 'i18next';

/** Время до сброса лимита GitHub: "через 3 м 5 с". */
export function resetIn(t: TFunction, resetUnixSec: number, now = Date.now()): string {
    const deltaMs = resetUnixSec * 1000 - now;
    if (deltaMs <= 0) return t('settings.github.resetNow');

    const totalSec = Math.floor(deltaMs / 1000);
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    if (minutes >= 60) {
        return t('settings.github.resetInHours', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
    }
    if (minutes > 0) return t('settings.github.resetInMinutes', { minutes, seconds });
    return t('settings.github.resetInSeconds', { seconds });
}
