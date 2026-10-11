import { settings, useSetting } from '@cion-suite/core/renderer';

import { Button } from '@/ui/shadcn/button';
import { ThemeIcon } from '@/ui/theme-icon';
import { uiTheme } from './apply-theme';
import { useT } from '@/lib/i18n';

export function ThemeToggle() {
    const t = useT();
    const theme = useSetting('theme');
    const next = uiTheme.resolve(theme) === 'dark' ? 'light' : 'dark';

    return (
        <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('theme.toggle')}
            title={t(`theme.${next}`)}
            onClick={() => void settings.set('theme', next)}
        >
            <ThemeIcon />
        </Button>
    );
}
