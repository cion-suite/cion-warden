import os from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({ app: { isPackaged: false } }));

vi.mock('electron', () => electron);

const saved = { ...process.env };

beforeEach(() => {
    vi.resetModules();
    electron.app.isPackaged = false;
    delete process.env.NODE_ENV;
});

afterEach(() => {
    process.env = { ...saved };
});

async function load() {
    return (await import('@app/utils/environment')).env;
}

describe('env', () => {
    it('упакованная сборка: NODE_ENV=development игнорируется', async () => {
        electron.app.isPackaged = true;
        process.env.NODE_ENV = 'development';

        expect((await load()).isDev).toBe(false);
    });

    it('неупакованная сборка: dev включает NODE_ENV=development', async () => {
        process.env.NODE_ENV = 'development';

        expect((await load()).isDev).toBe(true);
    });

    it('неупакованная сборка без NODE_ENV (preview) - не dev', async () => {
        expect((await load()).isDev).toBe(false);
    });

    it('username - пользователь ОС', async () => {
        expect((await load()).username).toBe(os.userInfo().username);
    });
});
