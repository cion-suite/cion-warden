export type Outcome = { ok: true } | { ok: false; error: string };

export interface UseUpdaterChannel {
    supported: boolean;
    isBeta: boolean | null;
    loading: boolean;
    setBeta: (next: boolean) => Promise<Outcome>;
}

export interface UseUpdaterCheck {
    supported: boolean;
    checking: boolean;
    check: () => Promise<Outcome>;
}
