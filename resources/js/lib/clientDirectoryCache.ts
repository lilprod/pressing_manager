import type { Client } from '../types';

/**
 * Annuaire des clients actifs de l'agence, conservé sur l'appareil pour retrouver un
 * client sans réseau (GET /clients/offline-directory). Rafraîchi au plus toutes les
 * 30 minutes quand le réseau est disponible ; jamais une donnée inventée : en
 * l'absence de cache, seule la liste des clients récemment consultés est proposée.
 */
export type DirectoryClient = Pick<Client, 'id' | 'agency_id' | 'first_name' | 'last_name' | 'phone' | 'email' | 'loyalty_points' | 'loyalty_tier_name' | 'loyalty_discount_rate'> & {
    city: string | null;
};

interface StoredDirectory {
    saved_at: string;
    clients: DirectoryClient[];
}

const REFRESH_AFTER_MS = 30 * 60 * 1000;

function key(agencyId: number): string {
    return `pm.clientDirectory.${agencyId}`;
}

export function readClientDirectory(agencyId: number): StoredDirectory | null {
    try {
        const raw = localStorage.getItem(key(agencyId));
        return raw ? (JSON.parse(raw) as StoredDirectory) : null;
    } catch {
        return null;
    }
}

export function writeClientDirectory(agencyId: number, clients: DirectoryClient[]): void {
    try {
        localStorage.setItem(key(agencyId), JSON.stringify({ saved_at: new Date().toISOString(), clients }));
    } catch {
        // Quota dépassé : on garde la recherche limitée aux clients récents.
    }
}

export function clientDirectoryIsStale(agencyId: number): boolean {
    const stored = readClientDirectory(agencyId);
    return stored === null || Date.now() - new Date(stored.saved_at).getTime() > REFRESH_AFTER_MS;
}

export function searchClientDirectory(agencyId: number, term: string, limit = 20): DirectoryClient[] {
    const needle = term.trim().toLowerCase();
    const compactNeedle = needle.replace(/\s+/g, '');
    const stored = readClientDirectory(agencyId);
    if (!stored || needle.length < 2) return [];
    return stored.clients
        .filter(
            (c) =>
                `${c.first_name} ${c.last_name}`.toLowerCase().includes(needle) ||
                `${c.last_name} ${c.first_name}`.toLowerCase().includes(needle) ||
                c.phone.replace(/\s+/g, '').includes(compactNeedle),
        )
        .slice(0, limit);
}
