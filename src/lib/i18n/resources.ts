import { en } from './locales/en';
import { ru } from './locales/ru';

export const resources = { en, ru } as const;

export type SupportedLocale = keyof typeof resources;

export const SUPPORTED_LOCALES = Object.keys(resources) as SupportedLocale[];

export const DEFAULT_LOCALE: SupportedLocale = 'en';
