// Без импорта front не грузит ядро: augmentation падает
import type {} from '@cion-suite/core';
import type { AddSourceOptions, Source, UpdateSourceOptions } from './sources';
import type { Script, ScriptCfgValues } from './scripts';
import type { ScriptDeps } from './script-deps';
import type { CatalogScript, SourceSync } from './catalog';
import type { Lib, LibSync } from './libs';
import type { Bind, BindSync } from './binds';
import type { ConfigSchema, ConfigValues } from './config';
import type { GithubLimit, GithubRepo } from './github';
import type { Font, FontInstall } from './fonts';

// Имя = путь в window: 'a:b:c' -> window.a.b.c.
// Запись канала - одна строка: так её читает 3.31.

declare module '@cion-suite/core' {
    interface IpcChannelMap {
        // -- Updater --
        'updater:refresh': { args: []; return: void };
        'updater:install': { args: []; return: void };
        'updater:changelog:get': { args: []; return: string | null };

        // -- Sources --
        'sources:list': { args: []; return: Source[] };
        'sources:add': { args: [options: AddSourceOptions]; return: Source };
        'sources:update': { args: [sourceId: string, options: UpdateSourceOptions]; return: Source };
        'sources:remove': { args: [sourceId: string]; return: void };
        'sources:token:set': { args: [sourceId: string, token: string]; return: void };
        'sources:token:remove': { args: [sourceId: string]; return: void };

        // -- GitHub --
        'github:limit:get': { args: []; return: GithubLimit };
        'github:repo:get': { args: [sourceId: string]; return: GithubRepo };

        // -- Catalog: удалённые скрипты и синхронизация --
        'catalog:sync': { args: [sourceId?: string]; return: SourceSync[] };
        'catalog:scripts:list': { args: [sourceId?: string]; return: CatalogScript[] };
        'catalog:scripts:install': { args: [sourceId: string, fileName: string]; return: void };

        // -- Libs --
        'libs:list': { args: [sourceId?: string]; return: Lib[] };
        'libs:install': { args: [sourceId: string, libId: string]; return: void };
        'libs:sync': { args: [sourceId?: string]; return: LibSync };
        'libs:delete': { args: [sourceId: string, libId: string]; return: void };
        'libs:folder:open': { args: [sourceId: string, libId: string]; return: void };
        'libs:web:open': { args: [sourceId: string, libId: string]; return: void };

        // -- Binds (пресеты) --
        'binds:list': { args: [sourceId?: string]; return: Bind[] };
        'binds:install': { args: [sourceId: string, presetId: string]; return: void };
        'binds:sync': { args: [sourceId?: string]; return: BindSync };
        'binds:delete': { args: [sourceId: string, presetId: string]; return: void };
        'binds:folder:open': { args: [sourceId: string, presetId: string]; return: void };
        'binds:schema:get': { args: [sourceId: string, presetId: string]; return: ConfigSchema | null };
        'binds:values:save': { args: [sourceId: string, presetId: string, values: ConfigValues]; return: void };

        // -- Scripts (локальные) --
        'scripts:list': { args: []; return: Script[] };
        'scripts:run': { args: [id: string]; return: void };
        'scripts:delete': { args: [filePath: string]; return: void };
        'scripts:processes:get': { args: []; return: boolean };
        'scripts:processes:remove': { args: [id: string]; return: void };
        'scripts:processes:clear': { args: []; return: void };
        'scripts:folder:open': { args: [filePath: string]; return: void };
        'scripts:config:get': { args: [configPath: string]; return: Partial<ScriptCfgValues> };
        'scripts:config:save': { args: [configPath: string, values: ScriptCfgValues]; return: void };
        'scripts:deps:get': { args: [id: string]; return: ScriptDeps };

        // -- Fonts --
        'fonts:list': { args: []; return: Font[] };
        'fonts:install': { args: [sourceId: string]; return: FontInstall };
        'fonts:remove': { args: [sourceId: string]; return: void };
    }

    // Значения main -> каждый renderer (kernel.run values)
    interface IpcValueMap {
        'app:env': { isDev: boolean; username: string; version: string };
    }
}
