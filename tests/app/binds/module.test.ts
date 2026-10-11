// Модуль связывает каналы binds и порядок запуска.
import { describe, expect, it } from 'vitest';
import { bindsHandlers } from '@app/binds/handlers';
import { bindsModule } from '@app/binds/module';
import { catalogModule } from '@app/catalog/module';

describe('bindsModule', () => {
    it('id, каналы и зависимость от catalog', () => {
        expect(bindsModule.id).toBe('binds');
        expect(bindsModule.handlers).toEqual([bindsHandlers]);
        expect(bindsModule.needs).toEqual([catalogModule]);
    });
});
