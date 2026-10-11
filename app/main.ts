import { app, crashReporter } from 'electron';
import { errors, ipc, kernel, settings } from '@cion-suite/core';
import { shell } from '@app/shell';
import { shellModule } from '@app/shell/module';
import { sourcesModule } from '@app/sources/module';
import { githubModule } from '@app/github/module';
import { catalogModule } from '@app/catalog/module';
import { fontsModule } from '@app/fonts/module';
import { libsModule } from '@app/libs/module';
import { bindsModule } from '@app/binds/module';
import { scriptsModule } from '@app/scripts/module';
import { updaterModule } from '@app/updater/module';
import { CONFIG } from '@shared/config';
import { settingsSchema } from '@shared/settings';
import { env } from '@app/utils/environment';
import { paths } from '@app/utils/paths';

// Имя и userData - до vault, settings и crashReporter: иначе
// сторы и данные прежнего приложения не найдутся
app.setName(CONFIG.appId);
app.setPath('userData', paths.userData());

// До whenReady: ловит самые ранние падения; без отправки
crashReporter.start({ uploadToServer: false });
app.setAppUserModelId(env.isDev ? `${CONFIG.appId}.dev` : CONFIG.appId);
settings.configure({ schema: settingsSchema });
ipc.configure({ thresholdMs: 50 });

void kernel.run({
    modules: [
        shellModule,
        sourcesModule,
        githubModule,
        catalogModule,
        fontsModule,
        libsModule,
        bindsModule,
        scriptsModule,
        updaterModule,
    ],
    values: {
        'app:env': {
            isDev: env.isDev,
            username: env.username,
            version: app.getVersion(),
        },
    },
    onSecondInstance: shell.main.focus,
    ready: async () => {
        // Без источников и каталога приложение бесполезно
        for (const [module, name] of [
            [sourcesModule, 'sources'],
            [catalogModule, 'catalog'],
        ] as const) {
            if (kernel.status(module).state !== 'running') {
                shell.splash.close();
                throw errors.fail('unavailable', `Не запустился модуль ${name}`);
            }
        }
        await shell.main.open();
    },
});
