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
    try {
        localStorage.setItem(cacheKey(agencyId), JSON.stringify(services));
        localStorage.setItem(`${cacheKey(agencyId)}.at`, new Date().toISOString());
    } catch {
        // Stockage plein ou indisponible : le catalogue reste servi par le réseau.
    }
}

/** Heure du dernier catalogue mis en cache pour cette agence (null si jamais). */
export function cachedServicesAt(agencyId: number): string | null {
    try {
        return localStorage.getItem(`${cacheKey(agencyId)}.at`);
    } catch {
        return null;
    }
}
