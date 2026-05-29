import { BrowserWindow } from 'electron';
import { z } from 'zod';
import { registerHandlers } from '@cion-suite/core/ipc';
import { events } from '@cion-suite/core/events';
import type { AppServices } from '../types/services.js';

const errorReportSchema = z.object({
    message: z.string(),
    stack: z.string().optional(),
    componentStack: z.string().optional(),
});

export function registerSystemHandlers(services: AppServices): void {
    registerHandlers({
        'system:renderer-ready': (event) => {
            const win = BrowserWindow.fromWebContents(event.sender);
            if (win) {
                services.logger.info('renderer ready');
                events.emit('app:ready', { startedAt: Date.now() }, { target: win });
            }
        },
        'errors:report': (_event, payload: unknown) => {
            const parsed = errorReportSchema.safeParse(payload);
            if (!parsed.success) {
                services.logger.error('renderer error: invalid payload', parsed.error.message);
                return;
            }
            services.logger.error('renderer error', parsed.data);
        },
    });
}
