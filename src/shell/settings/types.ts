import type { ReactNode } from 'react';
import type { GithubLimitEntry } from '@shared/types';

export interface StatusView {
    icon: ReactNode
    title: string
    description?: string
}

export interface GithubLimitRowProps {
    entry: GithubLimitEntry
}
