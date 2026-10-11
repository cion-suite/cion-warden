import type { GithubRepoRef } from '@shared/types';

/** Репозиторий релизов приложения; private - читается с PAT. */
export type ReleaseTarget = GithubRepoRef & { private?: boolean };

/** Версия последнего релиза; token - если был нужен. */
export interface ReleaseCandidate {
    target: ReleaseTarget;
    version: string;
    token: string | null;
}
