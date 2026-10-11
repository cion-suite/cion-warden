import { kernel } from '@cion-suite/core';
import { bindsHandlers } from '@app/binds/handlers';
import { catalogModule } from '@app/catalog/module';

export const bindsModule = kernel.module({
    id: 'binds',
    needs: [catalogModule],
    handlers: bindsHandlers,
});
