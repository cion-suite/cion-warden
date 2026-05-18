import { Button } from '@/shared/ui/shadcn/button';
import { i18n, SUPPORTED_LOCALES, useLocale, useT } from '@/shared/i18n';

export function LocaleToggle() {
    const t = useT();
    const current = useLocale();

    const handleClick = () => {
        const idx = SUPPORTED_LOCALES.indexOf(current);
        const next = SUPPORTED_LOCALES[(idx + 1) % SUPPORTED_LOCALES.length] ?? SUPPORTED_LOCALES[0];
        void i18n.changeLanguage(next);
    };

    return (
        <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('locale.toggle')}
            title={current.toUpperCase()}
            onClick={handleClick}
        >
            <span className="text-xs font-mono">{current.toUpperCase()}</span>
        </Button>
    );
}
