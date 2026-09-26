import type { Service } from '../types';

function cacheKey(agencyId: number): string {
    return `pm.servicesCache.${agencyId}`;
}

export function readCachedServices(agencyId: number): (Service & { effective_price: number })[] {
    try {
        const raw = localStorage.getItem(cacheKey(agencyId));
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export function writeCachedServices(agencyId: number, services: (Service & { effective_price: number })[]): void {
    localStorage.setItem(cacheKey(agencyId), JSON.stringify(services));
}
