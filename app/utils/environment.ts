import os from 'node:os';
import { app } from 'electron';

// В упакованной сборке dev выключен, окружение не читаем
const isDev = !app.isPackaged && process.env.NODE_ENV === 'development';

export const env = {
    isDev,
    username: os.userInfo().username,
} as const;
