import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function getErrorMessage(error: unknown, fallback = 'Unknown error'): string {
    return error instanceof Error ? error.message : fallback;
}

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}
