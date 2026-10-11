import fs from 'node:fs/promises';
import path from 'node:path';
import { errors, events, logger } from '@cion-suite/core';
import { catalog } from '@app/catalog';
import { fanout } from '@app/catalog/fanout';
import type { ManifestPresetEntry } from '@app/catalog/types';
import { github } from '@app/github';
import { preset } from '@app/binds/preset';
import { store, type SourceRecord } from '@app/sources/store';
import { fsx } from '@app/utils/fsx';
import { paths } from '@app/utils/paths';
import type { BindSync, PresetSchema, PresetValues } from '@shared/types';

const log = logger.child('Binds');

/** Пресет manifest и два его локальных файла: схема и значения. */
interface Located {
    source: SourceRecord;
    entry: ManifestPresetEntry;
    schemaPath: string;
    valuesPath: string;
}

function locate(source: SourceRecord, entry: ManifestPresetEntry): Located {
    const root = paths.source(source.id).presets;
    return {
        source,
        entry,
        schemaPath: fsx.confine(root, path.join(root, entry.fileName)),
        valuesPath: fsx.confine(root, path.join(root, `${catalog.stem(entry.fileName)}.values.json`)),
    };
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

async function download({ source, entry, schemaPath }: Located): Promise<void> {
    const content = await github.file(source, `${catalog.dir.presets}/${entry.fileName}`);
    await fsx.write(schemaPath, content);
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

/** Пресеты и их значения: global_vault/<источник>/presets. */
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

    // Значения лежат рядом со схемой и уходят вместе с ней
    async remove(sourceId: string, presetId: string): Promise<void> {
        const { schemaPath, valuesPath } = await find(sourceId, presetId);
        await fs.rm(schemaPath, { force: true });
        await fs.rm(valuesPath, { force: true });
        events.emit('bind:changed', { sourceId, presetId });
    },

    /** Путь схемы на диске; не скачана - not_found. */
    async local(sourceId: string, presetId: string): Promise<string> {
        const { schemaPath } = await find(sourceId, presetId);
        if (!await fsx.exists(schemaPath)) throw errors.fail('not_found', `Preset is not downloaded: ${presetId}`);
        return schemaPath;
    },

    /** Схема скачанного файла; нет manifest, пресета, файла - null. */
    async schema(sourceId: string, presetId: string): Promise<PresetSchema | null> {
        const found = await findOrNull(sourceId, presetId);
        if (!found) return null;
        const raw = await fsx.json.read<unknown>(found.schemaPath).catch((e: unknown) => {
            log.warn(`Preset is unreadable: ${presetId}`, e);
            return undefined;
        });
        return raw === undefined ? null : preset.schema(raw, found.entry.fileName);
    },

    values: {
        async get(sourceId: string, presetId: string): Promise<PresetValues> {
            const found = await findOrNull(sourceId, presetId);
            if (!found) return {};
            const raw = await fsx.json.read<unknown>(found.valuesPath).catch((e: unknown) => {
                log.warn(`Preset values are unreadable: ${presetId}`, e);
                return undefined;
            });
            return preset.flatten(raw);
        },

        // Без схемы значения не пишем: отложенное сохранение
        // иначе воскресило бы значения удалённого пресета
        async save(sourceId: string, presetId: string, values: PresetValues): Promise<void> {
            const { schemaPath, valuesPath } = await find(sourceId, presetId);
            if (!await fsx.exists(schemaPath)) throw errors.fail('not_found', `Preset is not downloaded: ${presetId}`);
            await fsx.json.write(valuesPath, preset.nest(values));
        },

        async reset(sourceId: string, presetId: string): Promise<void> {
            const found = await findOrNull(sourceId, presetId);
            if (found) await fs.rm(found.valuesPath, { force: true });
        },
    },
};
