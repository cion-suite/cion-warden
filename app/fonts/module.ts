import { kernel } from '@cion-suite/core';
import { catalogModule } from '@app/catalog/module';
import { fontsHandlers } from '@app/fonts/handlers';
import { startFonts, stopFonts } from '@app/fonts/start';
import { sourcesModule } from '@app/sources/module';

export const fontsModule = kernel.module({
    id: 'fonts',
    needs: [sourcesModule, catalogModule],
    handlers: fontsHandlers,
    start: startFonts,
    stop: stopFonts,
});
