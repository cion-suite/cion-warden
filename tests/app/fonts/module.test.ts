// Модуль fonts: каналы, предки, подписки в start и stop.
import { describe, expect, it, vi } from 'vitest';

const start = vi.hoisted(() => ({ startFonts: vi.fn(), stopFonts: vi.fn() }));

vi.mock('@app/fonts/start', () => start);

import { catalogModule } from '@app/catalog/module';
import { fontsHandlers } from '@app/fonts/handlers';
import { fontsModule } from '@app/fonts/module';
import { sourcesModule } from '@app/sources/module';

describe('fontsModule', () => {
    it('id, каналы и зависимости', () => {
        expect(fontsModule.id).toBe('fonts');
        expect(fontsModule.handlers).toEqual([fontsHandlers]);
        expect(fontsModule.needs).toEqual([sourcesModule, catalogModule]);
    });

    it('start и stop - подписки fonts', async () => {
        await fontsModule.start?.();
        await fontsModule.stop?.();

        expect(start.startFonts).toHaveBeenCalledTimes(1);
        expect(start.stopFonts).toHaveBeenCalledTimes(1);
    });
});
