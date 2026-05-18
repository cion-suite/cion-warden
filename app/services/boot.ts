import { app } from 'electron';
import { createLogger } from '@cion-suite/core/log';
import { createSecureStorage } from '@cion-suite/core/storage';
import { createSettingsStore } from '@cion-suite/core/settings';
import { installCrashReporter } from '@cion-suite/core/crash';

import { APP_ID, PRODUCT_NAME } from '../config.js';
import { settingsSchema } from './settings-schema.js';
import type { AppServices, AppSettings } from '../types/services.js';

export function bootServices(): AppServices {
    // Installed for its process-side-effect (native crash dumps); the controller
    // handle isn't part of AppServices.
    installCrashReporter({
        productName: PRODUCT_NAME,
        appId: APP_ID,
    });

    const logger = createLogger({ appId: APP_ID });
    logger.info('boot started');

    const storage = createSecureStorage({
        appId: APP_ID,
        onAudit: (event) => {
            if (event.type === 'error') {
                logger.error('secure-storage error', event.key, event.error);
            }
        },
    });

    const settings = createSettingsStore<AppSettings>({
        appId: APP_ID,
        schema: settingsSchema,
        defaults: settingsSchema.parse({}),
        currentVersion: app.getVersion(),
    });

    return { logger, storage, settings };
}
