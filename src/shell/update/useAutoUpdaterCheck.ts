import { useRef } from 'react';
import { useEvent } from '@cion-suite/core/renderer';

import { useT } from '@/lib/i18n';
import { toast } from '@/ui/toast';

/** Один тост на загрузку: прогресс -> готово / ошибка. */
export function useAutoUpdaterCheck(): void {
    const t = useT();
    const toastIdRef = useRef<string | undefined>(undefined);
    const titleRef = useRef('');

    useEvent('updater:available', (info) => {
        titleRef.current = t('updater.available.title', { version: info.version });
        toastIdRef.current = toast.loading(titleRef.current, { description: '0%' });
    });

    // Тост заменяется по id: тик прогресса не плодит новые.
    useEvent('updater:progress', (progress) => {
        if (!toastIdRef.current) return;
        toast.loading(titleRef.current, {
            id: toastIdRef.current,
            description: `${Math.round(progress.percent)}%`,
        });
    });

    useEvent('updater:downloaded', (info) => {
        toastIdRef.current = toast.success(t('updater.ready.title', { version: info.version }), {
            id: toastIdRef.current,
            description: t('updater.ready.description'),
            duration: Infinity,
            action: {
                label: t('updater.ready.restart'),
                onClick: () => {
                    toast.loading(t('updater.restarting'), { id: toastIdRef.current });
                    void toast.result(window.updater.install(), { error: t('updater.failed') });
                },
            },
        });
    });

    useEvent('updater:failed', (data) => {
        toast.error(t('updater.failed'), { id: toastIdRef.current, description: data.message });
        toastIdRef.current = undefined;
    });
}
