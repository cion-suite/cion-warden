// Публичный namespace catalog для libs, binds и scripts.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@app/sources/store', () => ({ store: { get: vi.fn(), list: vi.fn() } }));

import { catalog } from '@app/catalog';
import { manifest } from '@app/catalog/manifest';
import { metas } from '@app/catalog/metas';

describe('catalog', () => {
    it('открывает manifest, id, поиск, каталоги и metas', () => {
        expect(catalog.manifest.read).toBe(manifest.read);
        expect(catalog.manifest.get).toBe(manifest.get);
        expect(catalog.lib).toBe(manifest.lib);
        expect(catalog.preset).toBe(manifest.preset);
        expect(catalog.font).toBe(manifest.font);
        expect(catalog.metas).toBe(metas);
        expect(catalog.stem('x.ahk')).toBe('x');
    });

    it('имена каталогов репозитория', () => {
        expect(catalog.dir).toEqual({ scripts: 'scripts', cfg: 'cfg', lib: 'lib', presets: 'presets', fonts: 'assets/fonts' });
    });
});
