import { PageHeader } from '@/ui/PageHeader';
import { useT } from '@/lib/i18n';
import { AppearanceCard } from './AppearanceCard';
import { GithubCard } from './GithubCard';
import { LanguageCard } from './LanguageCard';
import { UpdatesCard } from './UpdatesCard';

export default function SettingsPage() {
    const t = useT();

    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            <PageHeader title={t('nav.settings')} description={t('settings.description')} />
            <AppearanceCard />
            <LanguageCard />
            <GithubCard />
            <UpdatesCard />
        </div>
    );
}
