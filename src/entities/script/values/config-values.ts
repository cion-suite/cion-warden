import type { Script, ScriptCfgValues } from '@shared/types/scripts';

export const configValues = {
    defaults(config: Script['config']): ScriptCfgValues {
        return {
            hk: Object.fromEntries(Object.entries(config?.hk ?? {}).map(([k, e]) => [k, e.key])),
            val: Object.fromEntries(Object.entries(config?.val ?? {}).map(([k, e]) => [k, e.val])),
        };
    },

    /** Сохранённое и правки перекрывают дефолты по ключам. */
    merge(defaults: ScriptCfgValues, saved: Partial<ScriptCfgValues>): ScriptCfgValues {
        return {
            hk: { ...defaults.hk, ...saved.hk },
            val: { ...defaults.val, ...saved.val },
        };
    },
};
