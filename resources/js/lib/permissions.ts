import type { User } from '../types';

export function hasPermission(user: User | null, slug: string): boolean {
    return Boolean(user?.role?.permissions?.some((p) => p.slug === slug));
}
