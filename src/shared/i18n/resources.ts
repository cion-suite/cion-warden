import type { SupportedLocale } from '@/shared/types/i18n';

import { en } from './locales/en.js';
import { ru } from './locales/ru.js';

export const resources = { en, ru } as const;

export const DEFAULT_LOCALE: SupportedLocale = 'en';
export const SUPPORTED_LOCALES = ['en', 'ru'] as const satisfies readonly SupportedLocale[];
