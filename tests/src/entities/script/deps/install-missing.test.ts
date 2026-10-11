import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installMissing } from '@/entities/script/deps/install-missing';
import type { MissingItem } from '@shared/types/script-deps';

const api = {
    libs: { install: vi.fn() },
    binds: { install: vi.fn() },
};

const lib: MissingItem = { kind: 'lib', sourceId: 's', libId: 'l', name: 'Lib' };
const preset: MissingItem = { kind: 'preset', sourceId: 's', presetId: 'p', name: 'Preset' };

beforeEach(() => {
    api.libs.install.mockReset().mockResolvedValue(undefined);
    api.binds.install.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal('window', api);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('installMissing', () => {
    it('lib идёт в libs.install, пресет в binds.install', async () => {
        const failed = await installMissing([lib, preset], () => {});

        expect(failed).toBe(0);
        expect(api.libs.install).toHaveBeenCalledWith('s', 'l');
        expect(api.binds.install).toHaveBeenCalledWith('s', 'p');
    });

    it('сообщает прогресс перед каждой установкой', async () => {
        const progress: Array<[number, string]> = [];

        await installMissing([lib, preset], (done, item) => progress.push([done, item.name]));

        expect(progress).toEqual([[0, 'Lib'], [1, 'Preset']]);
    });

    it('сбой одного не останавливает остальные, возвращает число сбоев', async () => {
        api.libs.install.mockRejectedValue(new Error('boom'));

        const failed = await installMissing([lib, preset, lib], () => {});

        expect(failed).toBe(2);
        expect(api.binds.install).toHaveBeenCalledTimes(1);
    });

    it('пустой список - без вызовов', async () => {
        await expect(installMissing([], () => {})).resolves.toBe(0);
        expect(api.libs.install).not.toHaveBeenCalled();
    });
});
