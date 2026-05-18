import type { ReactNode } from 'react';
import { toast as sonner, type ExternalToast } from 'sonner';

type ToastKind = 'success' | 'error' | 'info' | 'warning' | 'message' | 'loading';
type ToastId = string | number;

// Stable id per (kind, message) collapses duplicate toasts natively in sonner.
function buildKey(kind: ToastKind, message: unknown): string {
    return `${kind}::${typeof message === 'string' ? message : JSON.stringify(message)}`;
}

function call(kind: ToastKind, message: ReactNode, opts: ExternalToast = {}): ToastId {
    const merged: ExternalToast = { id: buildKey(kind, message), ...opts };
    return kind === 'message' ? sonner(message, merged) : sonner[kind](message, merged);
}

type ToastFn = (message: ReactNode, opts?: ExternalToast) => ToastId;

interface ToastApi extends ToastFn {
    success: ToastFn;
    error: ToastFn;
    info: ToastFn;
    warning: ToastFn;
    loading: ToastFn;
    dismiss: (id?: ToastId) => string | number;
}

export const toast: ToastApi = Object.assign(
    (message: ReactNode, opts?: ExternalToast) => call('message', message, opts),
    {
        success: (message: ReactNode, opts?: ExternalToast) => call('success', message, opts),
        error: (message: ReactNode, opts?: ExternalToast) => call('error', message, opts),
        info: (message: ReactNode, opts?: ExternalToast) => call('info', message, opts),
        warning: (message: ReactNode, opts?: ExternalToast) => call('warning', message, opts),
        loading: (message: ReactNode, opts?: ExternalToast) => call('loading', message, opts),
        dismiss: (id?: ToastId) => sonner.dismiss(id),
    }
);
