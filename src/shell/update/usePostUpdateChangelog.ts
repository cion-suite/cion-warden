import { useEffect, useState } from 'react';
import * as semver from 'semver';

import { state } from '@/lib/state';
import { filterChangelog } from './changelog-filter';

type PostUpdateChangelog = {
    open: boolean;
    changelog: string;
    fromVersion: string;
    close: () => void;
};

/** Лог между показанной и текущей версией, один раз. */
export function usePostUpdateChangelog(): PostUpdateChangelog {
    const { version } = window.app.env;
    const [open, setOpen] = useState(false);
    const [changelog, setChangelog] = useState('');
    const [fromVersion, setFromVersion] = useState('');

    useEffect(() => {
        const markShown = () => state.set('lastShownChangelogVersion', version);
        const stored = state.get('lastShownChangelogVersion');

        if (stored === version) return;
        // Пусто - первый запуск; откат и битое значение - так же
        if (!stored || !semver.valid(stored) || !semver.gt(version, stored)) {
            markShown();
            return;
        }

        let cancelled = false;
        window.updater.changelog.get()
            .then((markdown) => {
                if (cancelled) return;
                const filtered = markdown ? filterChangelog(markdown, stored, version) : '';
                if (!filtered) {
                    markShown();
                    return;
                }
                setChangelog(filtered);
                setFromVersion(stored);
                setOpen(true);
            })
            // Не помечаем показанным: повторим при следующем запуске
            .catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, [version]);

    const close = () => {
        setOpen(false);
        state.set('lastShownChangelogVersion', version);
    };

    return { open, changelog, fromVersion, close };
}
