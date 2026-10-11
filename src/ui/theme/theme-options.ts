import { MonitorIcon, MoonIcon, SunIcon, type LucideIcon } from 'lucide-react';

import type { Theme } from '@shared/settings';

/** Единая таблица тем: настройки и палитра команд. */
export const THEME_OPTIONS = [
    { value: 'light', icon: SunIcon },
    { value: 'dark', icon: MoonIcon },
    { value: 'system', icon: MonitorIcon },
] as const satisfies readonly { value: Theme; icon: LucideIcon }[];
