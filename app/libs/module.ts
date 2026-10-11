import { kernel } from '@cion-suite/core';
import { catalogModule } from '@app/catalog/module';
import { libsHandlers } from '@app/libs/handlers';

export const libsModule = kernel.module({
    id: 'libs',
    needs: [catalogModule],
    handlers: libsHandlers,
});
