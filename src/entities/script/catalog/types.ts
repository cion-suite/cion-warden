import type { CatalogScript } from '@shared/types/catalog';

export interface CatalogScriptRowProps {
    script: CatalogScript;
    downloading: boolean;
    onInstall: (script: CatalogScript) => void;
}
