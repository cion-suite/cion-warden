import { useT } from '@/lib/i18n';
import { githubFailure } from '@/lib/github-error';
import { toast } from '@/ui/toast';

/** Тосты операций с GitHub: известные отказы - своей фразой. */
export function useGithubToast() {
    const t = useT();

    const error = (e: unknown): void => {
        const { phrase, cause } = githubFailure(e, t);
        toast.error(phrase, { cause });
    };

    /** true - прошла; сбой показан тостом, не бросает. */
    const result = <T>(
        promise: Promise<T>,
        success?: string | ((result: T) => string),
    ): Promise<boolean> => toast.result(promise, { success, error });

    return { error, result };
}
