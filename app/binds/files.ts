import fs from 'node:fs/promises';
import { errors, events, logger } from '@cion-suite/core';
import { catalog } from '@app/catalog';
import { fanout } from '@app/catalog/fanout';
import type { ConfigRef, ManifestPresetEntry } from '@app/catalog/types';
import { github } from '@app/github';
import { store, type SourceRecord } from '@app/sources/store';
import { fsx } from '@app/utils/fsx';
import type { BindSync, ConfigSchema, ConfigValues } from '@shared/types';

const log = logger.child('Binds');

/** Пресет manifest и его рабочий файл: путь от корня источника. */
interface Located {
    source: SourceRecord;
    ref: ConfigRef;
    file: string;
}

function locate(source: SourceRecord, entry: ManifestPresetEntry): Located {
    const ref = { sourceId: source.id, path: `${catalog.dir.presets}/${entry.fileName}` };
    return { source, ref, file: catalog.config.path(ref) };
}

// Нет пресета в manifest - not_found
async function find(sourceId: string, presetId: string): Promise<Located> {
    const source = await store.get(sourceId);
    const entry = catalog.preset.find(await catalog.manifest.get(sourceId), sourceId, presetId);
    if (!entry) throw errors.fail('not_found', `Preset not found: ${presetId}`);
    return locate(source, entry);
}

// Нет manifest или пресета - null: данные, не ошибка
async function findOrNull(sourceId: string, presetId: string): Promise<Located | null> {
    const source = await store.get(sourceId);
    const data = await catalog.manifest.read(sourceId);
    const entry = data ? catalog.preset.find(data, sourceId, presetId) : null;
    return entry ? locate(source, entry) : null;
}

// Версия - sha скачанных байт, не результат переноса значений
async function download({ source, ref }: Located): Promise<void> {
    const content = await github.file(source, ref.path);
    await catalog.config.install(ref, content);
    await catalog.versions.record(source.id, { [ref.path]: fsx.sha(content) });
}

async function syncSource(source: SourceRecord): Promise<BindSync> {
    const data = await catalog.manifest.read(source.id);
    const result: BindSync = { ok: 0, failed: 0 };
    if (!data) return result;

    // Актуальные не качаем: экономит запросы к лимиту GitHub
    const { presets } = await catalog.metas(source.id);
    const fresh = new Set(presets.filter(p => p.isDownloaded && !p.hasUpdate).map(p => p.id));
    for (const entry of data.presets) {
        if (fresh.has(catalog.preset.id(source.id, entry.fileName))) continue;
        try {
            await download(locate(source, entry));
            result.ok++;
        } catch (e) {
            log.warn(`Preset download failed: ${entry.fileName}`, e, { sourceId: source.id });
            result.failed++;
        }
    }
    return result;
}

/** Пресеты: значения лежат прямо в рабочем .ahk. */
export const binds = {
    async install(sourceId: string, presetId: string): Promise<void> {
        await download(await find(sourceId, presetId));
        events.emit('bind:changed', { sourceId, presetId });
    },

    async sync(sourceId?: string): Promise<BindSync> {
        return fanout(sourceId, async (source) => {
            const result = await syncSource(source);
            events.emit('bind:changed', { sourceId: source.id, presetId: '*' });
            return result;
        }, log, 'Presets');
    },

    // Старый .values.json не трогаем: его никто не читает
    async remove(sourceId: string, presetId: string): Promise<void> {
        const { file } = await find(sourceId, presetId);
        await fs.rm(file, { force: true });
        events.emit('bind:changed', { sourceId, presetId });
    },

    /** Путь рабочего файла; не скачан - not_found. */
    async local(sourceId: string, presetId: string): Promise<string> {
        const { file } = await find(sourceId, presetId);
        if (!await fsx.exists(file)) throw errors.fail('not_found', `Preset is not downloaded: ${presetId}`);
        return file;
    },

    /** Схема со значениями; нет manifest, пресета, файла - null. */
    async schema(sourceId: string, presetId: string): Promise<ConfigSchema | null> {
        const found = await findOrNull(sourceId, presetId);
        return found ? catalog.config.read(found.ref) : null;
    },

    values: {
        // Без файла значения не пишем: отложенное сохранение
        // иначе воскресило бы значения удалённого пресета
        async save(sourceId: string, presetId: string, values: ConfigValues): Promise<void> {
            await catalog.config.save((await find(sourceId, presetId)).ref, values);
        },
    },
};
