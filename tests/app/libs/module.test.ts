// Модуль связывает каналы libs и порядок запуска.
import { describe, expect, it } from 'vitest';
import { catalogModule } from '@app/catalog/module';
import { libsHandlers } from '@app/libs/handlers';
import { libsModule } from '@app/libs/module';

describe('libsModule', () => {
    it('id, каналы и зависимость от catalog', () => {
        expect(libsModule.id).toBe('libs');
        expect(libsModule.handlers).toEqual([libsHandlers]);
        expect(libsModule.needs).toEqual([catalogModule]);
    });
});
