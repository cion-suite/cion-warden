import type { ReactNode } from 'react';
import { errors, logger } from '@cion-suite/core/renderer';
import { toast as manager } from '@/ui/shadcn/toast';

export { Toaster } from '@/ui/shadcn/toast';

type ToastKind = 'success' | 'error' | 'info' | 'warning' | 'loading';

interface ToastOptions {
    description?: ReactNode;
    /** `Infinity` - не скрывать. */
    duration?: number;
    action?: { label: ReactNode; onClick: () => void };
    /**
     * Id показанного тоста: заменяет его (`loading` -> `success`).
     * Без id повтор того же текста не плодит копии.
     */
    id?: string;
}

interface ErrorToastOptions extends ToastOptions {
    /** Пойманная ошибка: причина - к фразе, сама ошибка - в лог. */
    cause?: unknown;
}

const dedupId = (kind: ToastKind, title: ReactNode) =>
    `${kind}::${typeof title === 'string' ? title : JSON.stringify(title)}`;

const emit =
    (type: ToastKind) =>
    (title: ReactNode, { id, description, duration, action }: ToastOptions = {}): string =>
        manager.add({
            id: id ?? dedupId(type, title),
            type,
            title,
            description,
            timeout: duration === Infinity ? 0 : duration,
            actionProps: action && { children: action.label, onClick: action.onClick },
        });

const showError = emit('error');

const withReason = (phrase: string, reason: string) => (reason ? `${phrase}: ${reason}` : phrase);

/**
 * С `cause` - "фраза: причина"; в лог - если ошибка не из main
 * (отказ из main журналит ipc.configure).
 */
function error(phrase: string, { cause, ...options }: ErrorToastOptions = {}): string {
    if (cause === undefined) return showError(phrase, options);
    const info = errors.explain(cause);
    if (!info.remote) logger.error(phrase, cause);
    return showError(withReason(phrase, info.message), options);
}

interface ResultOptions<T> {
    /** Пустой текст или не задан - без тоста. */
    success?: string | ((result: T) => string);
    /** Фраза "Не удалось ..." с причиной или свой показ сбоя. */
    error: string | ((e: unknown) => void);
}

/** Тост исхода операции; true - прошла. Не бросает. */
async function result<T>(promise: Promise<T>, { success, error: phrase }: ResultOptions<T>): Promise<boolean> {
    let outcome: T;
    try {
        outcome = await promise;
    } catch (e) {
        if (typeof phrase === 'function') phrase(e);
        else toast.error(phrase, { cause: e });
        return false;
    }
    const text = typeof success === 'function' ? success(outcome) : success;
    if (text) toast.success(text);
    return true;
}

export const toast = {
    success: emit('success'),
    error,
    warning: emit('warning'),
    info: emit('info'),
    // Без timeout: Base UI не заводит таймер для 'loading'.
    loading: emit('loading'),
    close: manager.close,
    result,
};
