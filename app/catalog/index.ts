import { manifest } from '@app/catalog/manifest';
import { metas } from '@app/catalog/metas';

/** Каталог источников: manifest и метаданные для libs и binds. */
export const catalog = {
    dir: manifest.dir,
    stem: manifest.stem,
    manifest: { read: manifest.read, get: manifest.get },
    lib: manifest.lib,
    cfg: manifest.cfg,
    preset: manifest.preset,
    font: manifest.font,
    metas,
};
