import { describe, it, expect } from 'vitest';

import { patchStatus } from '@/lib/hooks/useQuerySync';
import type { Script } from '@shared/types';

const script = (id: string, overrides: Partial<Script> = {}): Script => ({
    id,
    name: id,
    filePath: `C:\\${id}.ahk`,
    status: 'idle',
    ...overrides,
});

describe('patchStatus: статус скрипта из события', () => {
    it('кеш не загружен -> undefined, запрос не создаётся', () => {
        expect(patchStatus(undefined, { id: 'a', status: 'running' })).toBeUndefined();
    });

    it('меняет только скрипт с этим id', () => {
        const list = [script('a'), script('b')];

        const next = patchStatus(list, { id: 'b', status: 'running' });

        expect(next?.map((s) => s.status)).toEqual(['idle', 'running']);
        expect(next?.[0]).toBe(list[0]);
    });

    it('error несёт текст, следующий статус его снимает', () => {
        const failed = patchStatus([script('a')], { id: 'a', status: 'error', errorMessage: 'bad' });
        expect(failed?.[0]).toMatchObject({ status: 'error', errorMessage: 'bad' });

        const idle = patchStatus(failed, { id: 'a', status: 'idle' });
        expect(idle?.[0]?.errorMessage).toBeUndefined();
    });

    it('исходный список не мутируется', () => {
        const list = [script('a')];

        patchStatus(list, { id: 'a', status: 'running' });

        expect(list[0]?.status).toBe('idle');
    });
});
