import { useTheme } from 'next-themes';

import { Button } from '@/shared/ui/shadcn/button';
import { ThemeIcon } from '@/shared/ui/theme-icon';
import { useT } from '@/shared/i18n';

export function ThemeToggle() {
    const t = useT();
    const { resolvedTheme, setTheme } = useTheme();
    const next = resolvedTheme === 'dark' ? 'light' : 'dark';

    return (
        <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('theme.toggle')}
            title={t(`theme.${next}`)}
            onClick={() => setTheme(next)}
        >
            <ThemeIcon />
        </Button>
    );
}
