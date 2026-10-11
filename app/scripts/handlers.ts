import { shell } from 'electron';
import { errors, logger, type IpcHandlers } from '@cion-suite/core';
import { deps } from '@app/scripts/deps';
import { scripts } from '@app/scripts';
import { processes } from '@app/scripts/processes';
import { fsx } from '@app/utils/fsx';
import { paths } from '@app/utils/paths';
import { schema } from '@shared/schema';
import type { Script, ScriptCfgValues } from '@shared/types';

const log = logger.child('Scripts');

const valuesPath = (configPath: string): string => configPath.replace(/\.json$/, '.values.json');

export const scriptsHandlers = {
    'scripts:list': (): Promise<Script[]> => scripts.list(),

    'scripts:run': {
        args: [schema.script.id],
        handle: id => processes.run(id),
    },

    'scripts:delete': {
        args: [schema.nonEmpty],
        handle: async (filePath) => {
            fsx.confine(paths.vault(), filePath);
            try {
                await shell.trashItem(filePath);
            } catch (e) {
                throw errors.fail('failed', 'Cannot move script to trash', { cause: e });
            }
        },
    },

    'scripts:processes:get': () => processes.probe(),

    'scripts:processes:remove': {
        args: [schema.script.id],
        handle: id => processes.remove(id),
    },

    'scripts:processes:clear': () => processes.clear(),

    'scripts:folder:open': {
        args: [schema.nonEmpty],
        handle: (filePath) => {
            shell.showItemInFolder(fsx.confine(paths.vault(), filePath));
        },
    },

    'scripts:config:get': {
        args: [schema.config.path],
        handle: async (configPath): Promise<Partial<ScriptCfgValues>> => {
            fsx.confine(paths.vault(), configPath);
            return (await fsx.json.read<Partial<ScriptCfgValues>>(valuesPath(configPath)).catch((e: unknown) => {
                log.warn(`Config values are unreadable: ${configPath}`, e);
                return undefined;
            })) ?? {};
        },
    },

    'scripts:config:save': {
        args: [schema.config.path, schema.script.values],
        handle: async (configPath, values) => {
            fsx.confine(paths.vault(), configPath);
            await fsx.json.write(valuesPath(configPath), values);
        },
    },

    'scripts:deps:get': {
        args: [schema.script.id],
        handle: id => deps.get(id),
    },
} satisfies IpcHandlers;
