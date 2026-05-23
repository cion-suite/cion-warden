import path from 'node:path';
import fs from 'node:fs/promises';
import { shell } from 'electron';
import { registerHandlers, appEvents } from '@cion-suite/core/ipc';
import type { PresetSchema, PresetValues, RemotePresetMeta } from '@shared/types/binds.js';
import type { AppServices } from '../types/services.js';
import { getGlobalVaultPath } from '../services/vault-paths.js';
import { listSources } from '../services/sources-store.js';
import {
    manifestToMetas,
    readManifest,
    stripExt,
} from '../services/vault-manifest.js';
import {
    deletePresetLocal,
    downloadAllPresets,
    downloadPreset,
    presetLocalPath,
} from '../services/vault-download.js';
import { readJsonFile, writeJsonFile } from '../utils/json-file.js';
import { requireString } from '../utils/ipc-args.js';

export interface SourcePresetsResult {
    presets: RemotePresetMeta[];
    lastSyncedAt?: number;
}

function valuesPathFromSchemaPath(schemaPath: string): string {
    const dir = path.dirname(schemaPath);
    const base = stripExt(path.basename(schemaPath));
    return path.join(dir, `${base}.values.json`);
}

type PrimitiveValue = string | number | boolean;

function inferType(v: unknown): 'hotkey' | 'number' | 'boolean' | null {
    if (typeof v === 'boolean') return 'boolean';
    if (typeof v === 'number' && Number.isFinite(v)) return 'number';
    // Binds context: strings are key bindings by default.
    if (typeof v === 'string') return 'hotkey';
    return null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === 'object' && !Array.isArray(v);
}

// Parse the on-disk preset JSON into a normalized schema. The file format is a
// flat values document grouped by top-level section (e.g. { "$version": 1,
// "misc": { "fps": 144, ... }, "game": { "shoot": "F9", ... } }). Metadata
// keys ($version etc.) and any non-object top-level entries are ignored.
function parsePresetSchema(raw: unknown, fileName: string): PresetSchema | null {
    if (!isPlainObject(raw)) return null;
    const sections: PresetSchema['sections'] = [];
    for (const [sectionKey, sectionVal] of Object.entries(raw)) {
        if (sectionKey.startsWith('$')) continue;
        if (!isPlainObject(sectionVal)) continue;
        const fields = [];
        for (const [fieldKey, fieldVal] of Object.entries(sectionVal)) {
            const type = inferType(fieldVal);
            if (!type) continue;
            fields.push({
                key: `${sectionKey}.${fieldKey}`,
                label: fieldKey,
                type,
                default: fieldVal as PrimitiveValue,
            });
        }
        if (fields.length > 0) {
            sections.push({ name: sectionKey, title: sectionKey, fields });
        }
    }
    return { title: stripExt(fileName), sections };
}

// On-disk values file is nested (mirrors schema layout). Flatten to
// "<section>.<field>": value for the renderer.
function nestedToFlat(raw: unknown): PresetValues {
    const out: PresetValues = {};
    if (!isPlainObject(raw)) return out;
    for (const [section, val] of Object.entries(raw)) {
        if (section.startsWith('$')) continue;
        if (!isPlainObject(val)) continue;
        for (const [field, v] of Object.entries(val)) {
            if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
                out[`${section}.${field}`] = v;
            }
        }
    }
    return out;
}

function flatToNested(flat: unknown): Record<string, Record<string, PrimitiveValue>> {
    const out: Record<string, Record<string, PrimitiveValue>> = {};
    if (!isPlainObject(flat)) return out;
    for (const [k, v] of Object.entries(flat)) {
        if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') continue;
        const dot = k.indexOf('.');
        if (dot <= 0 || dot === k.length - 1) continue;
        const section = k.slice(0, dot);
        const field = k.slice(dot + 1);
        if (!out[section]) out[section] = {};
        out[section][field] = v;
    }
    return out;
}

export function registerBindHandlers(services: AppServices): void {
    const { logger, sourceTokens } = services;

    registerHandlers({
        'binds:list': async (): Promise<RemotePresetMeta[]> => {
            const sources = await listSources(logger);
            const vaultBase = getGlobalVaultPath();
            const results = await Promise.allSettled(
                sources.map(async (source) => {
                    const manifest = await readManifest(vaultBase, source.id);
                    if (!manifest) return [];
                    const { presets } = await manifestToMetas(source, manifest, vaultBase);
                    return presets;
                }),
            );
            const out: RemotePresetMeta[] = [];
            for (let i = 0; i < results.length; i++) {
                const r = results[i]!;
                if (r.status === 'fulfilled') out.push(...r.value);
                else logger.warn('[binds:list] source failed', { sourceId: sources[i]?.id, error: r.reason });
            }
            return out;
        },

        'binds:list-source': async (_event, rawSourceId: unknown): Promise<SourcePresetsResult> => {
            const sourceId = requireString(rawSourceId, 'sourceId');
            const sources = await listSources(logger);
            const source = sources.find((s) => s.id === sourceId);
            if (!source) return { presets: [] };
            const vaultBase = getGlobalVaultPath();
            const manifest = await readManifest(vaultBase, sourceId);
            if (!manifest) return { presets: [], lastSyncedAt: undefined };
            const { presets } = await manifestToMetas(source, manifest, vaultBase);
            return { presets, lastSyncedAt: manifest.lastSyncedAt };
        },

        'binds:download': async (_event, rawSourceId: unknown, rawPresetId: unknown) => {
            const sourceId = requireString(rawSourceId, 'sourceId');
            const presetIdValue = requireString(rawPresetId, 'presetId');
            const sources = await listSources(logger);
            const source = sources.find((s) => s.id === sourceId);
            if (!source) throw new Error(`Source not found: ${sourceId}`);
            if (source.type !== 'git') throw new Error('Only git sources support download');
            await downloadPreset(source, presetIdValue, {
                vaultBase: getGlobalVaultPath(),
                tokens: sourceTokens,
                logger,
            });
            appEvents.emit('binds:changed', { sourceId, presetId: presetIdValue });
        },

        'binds:download-all': async (
            _event,
            rawSourceId: unknown,
        ): Promise<{ ok: number; failed: number }> => {
            if (rawSourceId != null && typeof rawSourceId !== 'string') {
                throw new Error('sourceId must be a string or omitted');
            }
            const sources = await listSources(logger);
            const gitSources = sources.filter((s) => s.type === 'git');
            if (rawSourceId != null) {
                const found = sources.find((s) => s.id === rawSourceId);
                if (!found) throw new Error(`Source not found: ${rawSourceId}`);
                if (found.type !== 'git') throw new Error('Only git sources support download');
            }
            const targeted =
                rawSourceId == null ? gitSources : gitSources.filter((s) => s.id === rawSourceId);

            const results = await Promise.allSettled(
                targeted.map((source) =>
                    downloadAllPresets(source, {
                        vaultBase: getGlobalVaultPath(),
                        tokens: sourceTokens,
                        logger,
                    }).then((res) => {
                        appEvents.emit('binds:changed', { sourceId: source.id, presetId: '*' });
                        return res;
                    }),
                ),
            );

            let ok = 0;
            let failed = 0;
            for (const r of results) {
                if (r.status === 'fulfilled') {
                    ok += r.value.ok;
                    failed += r.value.failed;
                } else {
                    failed++;
                }
            }
            return { ok, failed };
        },

        'binds:delete': async (_event, rawSourceId: unknown, rawPresetId: unknown) => {
            const sourceId = requireString(rawSourceId, 'sourceId');
            const presetIdValue = requireString(rawPresetId, 'presetId');
            const sources = await listSources(logger);
            const source = sources.find((s) => s.id === sourceId);
            if (!source) throw new Error(`Source not found: ${sourceId}`);
            if (source.type !== 'git') return;
            await deletePresetLocal(source, presetIdValue, {
                vaultBase: getGlobalVaultPath(),
                tokens: sourceTokens,
                logger,
            });
            appEvents.emit('binds:changed', { sourceId, presetId: presetIdValue });
        },

        'binds:open-local': async (_event, rawSourceId: unknown, rawPresetId: unknown) => {
            const sourceId = requireString(rawSourceId, 'sourceId');
            const presetIdValue = requireString(rawPresetId, 'presetId');
            const sources = await listSources(logger);
            const source = sources.find((s) => s.id === sourceId);
            if (!source || source.type !== 'git') return;
            const local = await presetLocalPath(source, presetIdValue, getGlobalVaultPath());
            if (!local) return;
            shell.showItemInFolder(local);
        },

        'binds:get-schema': async (_event, rawSourceId: unknown, rawPresetId: unknown): Promise<PresetSchema | null> => {
            const sourceId = requireString(rawSourceId, 'sourceId');
            const presetIdValue = requireString(rawPresetId, 'presetId');
            const sources = await listSources(logger);
            const source = sources.find((s) => s.id === sourceId);
            if (!source || source.type !== 'git') return null;
            const local = await presetLocalPath(source, presetIdValue, getGlobalVaultPath());
            if (!local) return null;
            const raw = await readJsonFile<unknown>(local);
            return parsePresetSchema(raw, path.basename(local));
        },

        'binds:get-values': async (_event, rawSourceId: unknown, rawPresetId: unknown): Promise<PresetValues> => {
            const sourceId = requireString(rawSourceId, 'sourceId');
            const presetIdValue = requireString(rawPresetId, 'presetId');
            const sources = await listSources(logger);
            const source = sources.find((s) => s.id === sourceId);
            if (!source || source.type !== 'git') return {};
            const schemaPath = await presetLocalPath(source, presetIdValue, getGlobalVaultPath());
            if (!schemaPath) return {};
            const valuesPath = valuesPathFromSchemaPath(schemaPath);
            return nestedToFlat(await readJsonFile<unknown>(valuesPath));
        },

        'binds:save-values': async (
            _event,
            rawSourceId: unknown,
            rawPresetId: unknown,
            rawValues: unknown,
        ) => {
            const sourceId = requireString(rawSourceId, 'sourceId');
            const presetIdValue = requireString(rawPresetId, 'presetId');
            const sources = await listSources(logger);
            const source = sources.find((s) => s.id === sourceId);
            if (!source || source.type !== 'git') return;
            const schemaPath = await presetLocalPath(source, presetIdValue, getGlobalVaultPath());
            if (!schemaPath) return;
            // Don't write an orphan values file if the schema was removed
            // out-of-band (e.g. resync dropped the preset, or another window
            // deleted it). Without this guard a stale debounced save would
            // resurrect values for a preset the user can no longer see.
            try {
                await fs.access(schemaPath);
            } catch {
                return;
            }
            const valuesPath = valuesPathFromSchemaPath(schemaPath);
            await writeJsonFile(valuesPath, flatToNested(rawValues));
        },

        'binds:reset': async (_event, rawSourceId: unknown, rawPresetId: unknown) => {
            const sourceId = requireString(rawSourceId, 'sourceId');
            const presetIdValue = requireString(rawPresetId, 'presetId');
            const sources = await listSources(logger);
            const source = sources.find((s) => s.id === sourceId);
            if (!source || source.type !== 'git') return;
            const schemaPath = await presetLocalPath(source, presetIdValue, getGlobalVaultPath());
            if (!schemaPath) return;
            const valuesPath = valuesPathFromSchemaPath(schemaPath);
            await fs.rm(valuesPath, { force: true });
        },
    });
}
