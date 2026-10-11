import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn() }));
vi.mock('@app/sources/store', () => ({ store }));

import { fanout } from '@app/catalog/fanout';

const log = { warn: vi.fn() } as unknown as Parameters<typeof fanout>[2];
const a = { id: 'a' };
const b = { id: 'b' };

beforeEach(() => {
    store.list.mockReset().mockResolvedValue([a, b]);
    store.get.mockReset().mockResolvedValue(a);
    vi.mocked(log.warn).mockReset();
});

describe('fanout', () => {
    it('без sourceId обходит все источники и суммирует итоги', async () => {
        const work = vi.fn().mockResolvedValueOnce({ ok: 2, failed: 1 }).mockResolvedValueOnce({ ok: 3, failed: 0 });

        expect(await fanout(undefined, work, log, 'Libraries')).toEqual({ ok: 5, failed: 1 });
        expect(store.get).not.toHaveBeenCalled();
    });

    it('с sourceId берёт один источник', async () => {
        const work = vi.fn().mockResolvedValue({ ok: 1, failed: 0 });

        await fanout('a', work, log, 'Libraries');

        expect(work).toHaveBeenCalledTimes(1);
        expect(work.mock.calls[0]?.[0]).toBe(a);
    });

    it('отказ источника - failed++ и предупреждение, остальные считаются', async () => {
        const boom = new Error('boom');
        const work = vi.fn().mockRejectedValueOnce(boom).mockResolvedValueOnce({ ok: 3, failed: 0 });

        expect(await fanout(undefined, work, log, 'Presets')).toEqual({ ok: 3, failed: 1 });
        expect(log.warn).toHaveBeenCalledWith('Presets sync failed', boom, { sourceId: 'a' });
    });

    it('неизвестный sourceId бросает', async () => {
        store.get.mockRejectedValue(new Error('nope'));

        await expect(fanout('x', vi.fn(), log, 'Libraries')).rejects.toThrow('nope');
    });
});
