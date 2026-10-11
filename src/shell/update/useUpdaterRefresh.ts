import { useState } from 'react';
import { errors, useEvent } from '@cion-suite/core/renderer';

import { useT } from '@/lib/i18n';
import { toast } from '@/ui/toast';

/** Ручная проверка; сбой показывает тост `updater:failed`. */
export function useUpdaterRefresh() {
    const t = useT();
    const [checking, setChecking] = useState(false);

    // Плановая проверка без новой версии тост не показывает
    useEvent('updater:checked', () => {
        if (checking) toast.success(t('updater.notAvailable'));
    });

    /** true - проверка выполнена; отказ и сбой - false. */
    const check = async (): Promise<boolean> => {
        setChecking(true);
        try {
            await window.updater.refresh();
            return true;
        } catch (e) {
            // Прочие сбои показал useAutoUpdaterCheck по событию
            const info = errors.explain(e);
            if (info.code === 'rate_limited') toast.warning(info.message);
            return false;
        } finally {
            setChecking(false);
        }
    };

    return { checking, check };
}
