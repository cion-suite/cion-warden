export function useScriptRunner() {
    const run = (id: string) => window.app?.scripts.run(id) ?? Promise.resolve();
    const stop = (id: string) => window.app?.scripts.stop(id) ?? Promise.resolve();
    const stopAll = () => window.app?.scripts.stopAll() ?? Promise.resolve();

    return { run, stop, stopAll };
}
