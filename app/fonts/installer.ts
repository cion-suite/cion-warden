import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '@cion-suite/core';
import { catalog } from '@app/catalog';
import type { ManifestFontEntry } from '@app/catalog/types';
import { ledger } from '@app/fonts/ledger';
import { registry } from '@app/fonts/registry';
import type { SourceRecord } from '@app/sources/store';
import { github } from '@app/github';
import { fsx } from '@app/utils/fsx';
import { paths } from '@app/utils/paths';
import type { Font, FontInstall } from '@shared/types';

const log = logger.child('Fonts');

const NOTHING: FontInstall = { ok: 0, failed: 0, skipped: 0 };

type Outcome =
    | { kind: 'ok'; font: Font; load: string[]; unload: string[] }
    // 404 в репозитории - пропуск, а не сбой
    | { kind: 'missing' }
    | { kind: 'failed' };

// Имя файла с id источника: два источника с Arial.ttf
// не столкнутся в общем каталоге шрифтов
const fileFor = (sourceId: string, fileName: string): string =>
    path.join(paths.fonts.dir(), `${sourceId}__${fileName}`);

async function installOne(
    source: SourceRecord,
    entry: ManifestFontEntry,
    prev: Font | undefined,
): Promise<Outcome> {
    const dest = fileFor(source.id, entry.fileName);
    const name = registry.name(source.id, entry.face, entry.fileName);
    const load: string[] = [];
    const unload: string[] = [];

    const existing = await fs.readFile(dest).catch(() => null);
    let written = false;
    if (!existing || fsx.sha(existing) !== entry.sha) {
        const content = await github.file(source, `${catalog.dir.fonts}/${entry.fileName}`, { fallback: null });
        if (!content) return { kind: 'missing' };
        await fs.mkdir(path.dirname(dest), { recursive: true });
        try {
            // Не fsx.write: занятый системой файл узнаём по EBUSY
            await fs.writeFile(dest, content);
            written = true;
        } catch (e) {
            // Занят прошлым сеансом: поможет только перевход
            if ((e as NodeJS.ErrnoException).code === 'EBUSY') {
                log.warn('Font file locked, needs logoff', e, { fileName: entry.fileName });
                return { kind: 'failed' };
            }
            throw e;
        }
    }

    // Лицо или файл сменились: старое значение HKCU убираем,
    // иначе реестр копит дубли
    if (prev && prev.registryName !== name) {
        registry.delete(prev.registryName);
        unload.push(prev.systemPath);
    }
    if (prev && prev.systemPath !== dest) await fs.rm(prev.systemPath, { force: true }).catch(() => undefined);

    const added = registry.add(name, dest);
    if (!added.ok) {
        log.warn('Font reg add failed', { fileName: entry.fileName, stderr: added.stderr });
        if (written) await fs.rm(dest, { force: true }).catch(() => undefined);
        return { kind: 'failed' };
    }

    if (written || !prev || prev.registryName !== name) load.push(dest);
    return {
        kind: 'ok',
        font: {
            assetId: catalog.font.id(source.id, entry.fileName),
            sourceId: source.id,
            fileName: entry.fileName,
            face: entry.face,
            sha: entry.sha,
            systemPath: dest,
            registryName: name,
            installedAt: Date.now(),
        },
        load,
        unload,
    };
}

async function installLocked(source: SourceRecord): Promise<FontInstall> {
    const data = await catalog.manifest.read(source.id);
    if (!data) return NOTHING;
    // Ветка manifest - та, откуда взяты sha: источник могли
    // переключить в UI до пересинхронизации
    const pinned = { ...source, branch: data.branch };

    const index = await ledger.read();
    const total: FontInstall = { ok: 0, failed: 0, skipped: 0 };
    const load: string[] = [];
    const unload: string[] = [];

    for (const entry of data.fonts) {
        if (entry.skip) {
            total.skipped++;
            continue;
        }
        const id = catalog.font.id(source.id, entry.fileName);
        const prev = index[id];
        if (
            prev
            && prev.sha === entry.sha
            && prev.systemPath === fileFor(source.id, entry.fileName)
            && prev.registryName === registry.name(source.id, entry.face, entry.fileName)
        ) {
            // Файл могли удалить руками: тогда ставим заново
            if (await fsx.exists(prev.systemPath)) {
                total.skipped++;
                continue;
            }
            delete index[id];
            await ledger.write(index);
        }

        try {
            const outcome = await installOne(pinned, entry, prev);
            if (outcome.kind === 'missing') total.skipped++;
            else if (outcome.kind === 'failed') total.failed++;
            else {
                index[id] = outcome.font;
                // Запись сразу: обрыв между reg add и концом цикла
                // оставил бы значение HKCU без следа в индексе
                await ledger.write(index);
                load.push(...outcome.load);
                unload.push(...outcome.unload);
                total.ok++;
            }
        } catch (e) {
            log.warn('Font install failed', e, { fileName: entry.fileName });
            total.failed++;
        }
    }

    await registry.broadcast(load, unload);
    return total;
}

// Сначала файл, затем реестр: при сбое rm запись остаётся,
// и повтор найдёт сироту
function removeLocked(match: (font: Font) => boolean): Promise<void> {
    return ledger.lock(async () => {
        const index = await ledger.read();
        const unload: string[] = [];
        for (const [id, font] of Object.entries(index)) {
            if (!match(font)) continue;
            try {
                await fs.rm(font.systemPath, { force: true });
            } catch (e) {
                log.warn('Font file remove failed, index entry kept', e, { fileName: font.fileName });
                continue;
            }
            registry.delete(font.registryName);
            delete index[id];
            unload.push(font.systemPath);
        }
        if (unload.length === 0) return;
        await ledger.write(index);
        await registry.broadcast([], unload);
    });
}

/** Шрифты источников в Windows; на других ОС ничего. */
export const installer = {
    list: (): Promise<Font[]> => ledger.lock(async () => Object.values(await ledger.read())),

    install(source: SourceRecord): Promise<FontInstall> {
        if (process.platform !== 'win32') return Promise.resolve(NOTHING);
        return ledger.lock(() => installLocked(source));
    },

    remove(sourceId: string): Promise<void> {
        if (process.platform !== 'win32') return Promise.resolve();
        return removeLocked(font => font.sourceId === sourceId);
    },

    /** Убирает шрифты источников, которых нет среди known. */
    prune(known: ReadonlySet<string>): Promise<void> {
        if (process.platform !== 'win32') return Promise.resolve();
        return removeLocked(font => !known.has(font.sourceId));
    },

    /** Шрифты каждого источника; сбой одного не мешает. */
    async all(sources: SourceRecord[]): Promise<void> {
        for (const source of sources) {
            try {
                await installer.install(source);
            } catch (e) {
                log.warn('Fonts install failed for source', e, { sourceId: source.id });
            }
        }
    },
};
