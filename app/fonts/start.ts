import { events, logger } from '@cion-suite/core';
import { installer } from '@app/fonts/installer';
import { store } from '@app/sources/store';

const log = logger.child('Fonts');

let subscriptions: Array<() => void> = [];

// Страховка от падения между sources.json и чисткой шрифтов;
// при ошибке чтения списка ничего не трогаем
async function reconcile(): Promise<void> {
    try {
        const sources = await store.list();
        await installer.prune(new Set(sources.map(source => source.id)));
        await installer.all(sources);
    } catch (e) {
        log.warn('Fonts reconcile skipped', e);
    }
}

export function startFonts(): void {
    if (process.platform !== 'win32') return;

    subscriptions = [
        events.on('source:synced', ({ sourceId }) => {
            store.get(sourceId)
                .then(installer.install)
                .catch((e: unknown) => log.warn('Post-sync fonts install failed', e, { sourceId }));
        }),
        events.on('source:changed', ({ sourceId, type }) => {
            if (type !== 'remove') return;
            installer.remove(sourceId).catch((e: unknown) => log.warn('Fonts removal failed', e, { sourceId }));
        }),
    ];
    void reconcile();
}

export function stopFonts(): void {
    for (const off of subscriptions) off();
    subscriptions = [];
}
