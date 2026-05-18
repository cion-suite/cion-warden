export interface StorageEntry<T> {
    readonly key: string;
    readonly default: T;
    get(): T;
    set(value: T): void;
}

export function defineStorage<T>(config: {
    key: string;
    default: T;
    validate?: (value: unknown) => value is T;
}): StorageEntry<T> {
    return {
        key: config.key,
        default: config.default,
        get(): T {
            try {
                const raw = localStorage.getItem(config.key);
                if (raw === null) return config.default;
                const parsed = JSON.parse(raw) as unknown;
                if (config.validate && !config.validate(parsed)) return config.default;
                return parsed as T;
            } catch {
                return config.default;
            }
        },
        set(value: T): void {
            try {
                localStorage.setItem(config.key, JSON.stringify(value));
            } catch {
                // ignore quota/privacy errors
            }
        },
    };
}
