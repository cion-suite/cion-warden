import type { TFunction } from 'i18next';
import { errors } from '@cion-suite/core/renderer';

/** Фраза тоста для отказа GitHub; cause дописывает toast.error. */
export function githubFailure(e: unknown, t: TFunction): { phrase: string; cause?: unknown } {
    const { code, status } = errors.explain(e);
    if (code === 'unauthorized') return { phrase: t('sources.tokenInvalid') };
    if (code === 'forbidden') return { phrase: t('sources.tokenNoAccess') };
    if (code === 'not_found' && status === 404) return { phrase: t('sources.repoNotFound') };
    return { phrase: t('error'), cause: e };
}
