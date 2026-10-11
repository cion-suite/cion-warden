// Реальный electron-log (renderer и main) виснет под node
const noop = () => {};

export default {
    error: noop,
    warn: noop,
    info: noop,
    verbose: noop,
    debug: noop,
    silly: noop,
    initialize: noop,
    hooks: [],
    transports: { file: {}, console: {} },
};
