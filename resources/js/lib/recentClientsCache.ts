import type { Client } from '../types';

const KEY = 'pm.recentClients';
const MAX = 30;

export function readRecentClients(): Client[] {
    try {
        const raw = localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export function rememberClients(clients: Client[]): void {
    const existing = readRecentClients();
    const merged = [...clients, ...existing.filter((c) => !clients.some((n) => n.id === c.id))].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(merged));
}
