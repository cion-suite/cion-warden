import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const where = vi.hoisted(() => ({ dir: '' }));

vi.mock('@app/utils/paths', () => ({
    paths: { source: (id: string) => ({ manifest: `${where.dir}/${id}.manifest.json` }) },
}));

import { manifest } from '@app/catalog/manifest';
import type { ManifestFile } from '@app/catalog/types';

beforeEach(async () => {
    where.dir = await fs.mkdtemp(path.join(os.tmpdir(), 'warden-manifest-'));
});

afterEach(async () => {
    await fs.rm(where.dir, { recursive: true, force: true });
});

const seed = (id: string, content: unknown) =>
    fs.writeFile(`${where.dir}/${id}.manifest.json`, typeof content === 'string' ? content : JSON.stringify(content));

describe('manifest.read', () => {
    it('нет файла, битый json, не объект - null', async () => {
        await expect(manifest.read('a')).resolves.toBeNull();

        await seed('a', '{oops');
        await expect(manifest.read('a')).resolves.toBeNull();

        await seed('a', 'null');
        await expect(manifest.read('a')).resolves.toBeNull();
        await seed('a', '5');
        await expect(manifest.read('a')).resolves.toBeNull();
    });

    it('старый manifest дополняется значениями по умолчанию', async () => {
        await seed('a', { scripts: [{ fileName: 'x.ahk', sha: '1', downloadUrl: null }], libs: [{ name: 'l' }] });

        const data = await manifest.read('a');

        expect(data).toMatchObject({
            version: 1,
            etag: null,
            treeSha: null,
            branch: 'main',
            lastSyncedAt: 0,
            lastCheckedAt: 0,
            cfgs: [],
            presets: [],
            fonts: [],
            libs: [{ name: 'l', kind: 'file', path: '', sha: '', files: [] }],
        });
        expect(data?.scripts).toHaveLength(1);
    });

    it('lastCheckedAt по умолчанию равен lastSyncedAt', async () => {
        await seed('a', { lastSyncedAt: 42 });

        await expect(manifest.read('a')).resolves.toMatchObject({ lastSyncedAt: 42, lastCheckedAt: 42 });
    });
});

describe('manifest.get', () => {
    it('нет manifest - not_found', async () => {
        await expect(manifest.get('a')).rejects.toMatchObject({ code: 'not_found', message: 'Source is not synced' });
    });
});

describe('manifest.write', () => {
    it('читается обратно', async () => {
        const data: ManifestFile = {
            version: 4, etag: 'e', treeSha: 't', branch: 'main', lastSyncedAt: 1, lastCheckedAt: 2,
            scripts: [], cfgs: [], libs: [], presets: [], fonts: [],
        };

        await manifest.write('a', data);

        await expect(manifest.read('a')).resolves.toEqual(data);
    });
});

describe('id и поиск', () => {
    const data = {
        libs: [{ name: 'util', kind: 'file', path: 'util.ahk', sha: '1', files: [] }],
        presets: [{ fileName: 'p.json', sha: '2', downloadUrl: null }],
    } as unknown as ManifestFile;

    it('id составляются из источника и имени', () => {
        expect(manifest.lib.id('s', 'util')).toBe('s:lib:util');
        expect(manifest.preset.id('s', 'p.json')).toBe('s:preset:p.json');
        expect(manifest.font.id('s', 'f.ttf')).toBe('s:font:f.ttf');
    });

    it('find возвращает запись по id или null', () => {
        expect(manifest.lib.find(data, 's', 's:lib:util')?.name).toBe('util');
        expect(manifest.lib.find(data, 's', 'x:lib:util')).toBeNull();
        expect(manifest.preset.find(data, 's', 's:preset:p.json')?.fileName).toBe('p.json');
        expect(manifest.preset.find(data, 's', 's:preset:none.json')).toBeNull();
    });

    it('stem снимает последнее расширение', () => {
        expect([manifest.stem('a.b.ahk'), manifest.stem('plain'), manifest.stem('.hidden')]).toEqual(['a.b', 'plain', '.hidden']);
    });
});
