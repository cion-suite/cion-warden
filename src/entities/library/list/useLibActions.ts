import type { Lib } from '@shared/types';
import { useCatalogActions } from '@/kit/catalog-actions';
import { useT } from '@/lib/i18n';
import { toast } from '@/ui/toast';

export function useLibActions() {
    const t = useT();
    const catalog = useCatalogActions<Lib>({
        i18n: 'libs',
        invalidate: ['libs:list'],
        install: (sourceId, id) => window.libs.install(sourceId, id),
        remove: (sourceId, id) => window.libs.delete(sourceId, id),
        openFolder: (sourceId, id) => window.libs.folder.open(sourceId, id),
        sync: () => window.libs.sync(),
    });

    const openWeb = async (lib: Lib) => {
        await toast.result(window.libs.web.open(lib.sourceId, lib.id), { error: t('error') });
    };

    return { ...catalog, openWeb };
}
