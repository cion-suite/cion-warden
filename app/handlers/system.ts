import { BrowserWindow } from 'electron';
import { z } from 'zod';
import { appEvents, registerHandlers } from '@cion-suite/core/ipc';
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
                appEvents.emitTo(win, 'app:ready', { startedAt: Date.now() });
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
