import type { Bind } from '@shared/types';

import { useCatalogActions } from '@/kit/catalog-actions';

export function useBindActions() {
    return useCatalogActions<Bind>({
        i18n: 'binds',
        invalidate: ['binds:list', 'binds:schema:get', 'binds:values:get'],
        install: (sourceId, id) => window.binds.install(sourceId, id),
        remove: (sourceId, id) => window.binds.delete(sourceId, id),
        openFolder: (sourceId, id) => window.binds.folder.open(sourceId, id),
        sync: () => window.binds.sync(),
    });
}
