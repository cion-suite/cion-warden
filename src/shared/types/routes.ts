import type { ROUTES } from '@/shared/config/routes';

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];
