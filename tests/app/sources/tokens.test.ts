import { beforeEach, describe, expect, it, vi } from 'vitest';

const vault = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }));

vi.mock('@cion-suite/core', async (importOriginal) => ({
    ...await importOriginal<typeof import('@cion-suite/core')>(),
    vault,
}));

import { tokens } from '@app/sources/tokens';

beforeEach(() => {
    vault.get.mockReset();
    vault.set.mockReset().mockResolvedValue(undefined);
    vault.delete.mockReset().mockResolvedValue(undefined);
});

describe('tokens: ключ в vault', () => {
    it('ключ прежний, source:token:<id>: старые PAT читаются', async () => {
        vault.get.mockResolvedValue('abc');

        await expect(tokens.get('s1')).resolves.toBe('abc');
        await tokens.set('s1', 'abc');
        await tokens.remove('s1');

        expect(vault.get).toHaveBeenCalledWith('source:token:s1');
        expect(vault.set).toHaveBeenCalledWith('source:token:s1', 'abc');
        expect(vault.delete).toHaveBeenCalledWith('source:token:s1');
    });

    it('сбой vault пробрасывается, а не превращается в null', async () => {
        vault.get.mockRejectedValue(new Error('нет safeStorage'));

        await expect(tokens.get('s1')).rejects.toThrow('нет safeStorage');
        await expect(tokens.mask('s1')).rejects.toThrow('нет safeStorage');
    });
});

describe('tokens.mask', () => {
    async function mask(raw: string | null): Promise<string | null> {
        vault.get.mockResolvedValue(raw);
        return tokens.mask('s1');
    }

    it('нет токена - null', async () => {
        expect(await mask(null)).toBeNull();
    });

    it('короче 8 символов - полностью скрыт', async () => {
        expect(await mask('abc1234')).toBe('***');
    });

    it('fine-grained PAT: префикс, первый и последний символ секрета', async () => {
        expect(await mask('github_pat_11ABCDEF0_secretvalue1234')).toBe('github_pat_1***4');
    });

    it('classic PAT ghp_', async () => {
        expect(await mask('ghp_abcdefghijklmnop')).toBe('ghp_a***p');
    });

    it('без разделителя или с секретом из одного символа - ***', async () => {
        expect(await mask('github_patABCDEFGH')).toBe('***');
        expect(await mask('ghpABCDE_x')).toBe('***');
    });

    it('неизвестный формат - первый и последний символ', async () => {
        expect(await mask('xoxb-1234567890')).toBe('x***0');
    });
});
