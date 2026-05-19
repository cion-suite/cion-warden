import type { ScriptMeta } from '@shared/types/scripts';

export function useScriptRunner() {
    const run = (id: string) => window.app?.scripts.run(id) ?? Promise.resolve();
    const stop = (id: string) => window.app?.scripts.stop(id) ?? Promise.resolve();

    const stopAll = async (scripts: ScriptMeta[]) => {
        const running = scripts.filter((s) => s.status === 'running');
        await Promise.all(running.map((s) => window.app?.scripts.stop(s.id)));
    };

    return { run, stop, stopAll };
}
