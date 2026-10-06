import { api, ApiError } from './api';
import { listPendingOrders, markPendingOrderError, removePendingOrder } from './offlineDb';

export const syncEvents = new EventTarget();

/** Horodatage réel de la dernière fois où la file a été vidée avec succès (plus
 * aucune commande en attente ni en erreur) — jamais une heure fabriquée. Lu par
 * `useLastSyncedAt()` pour la pastille d'en-tête « À jour • HH:MM » et l'écran
 * Synchronisation. */
const LAST_SYNCED_KEY = 'pm.lastSyncedAt';

let flushing = false;

export async function flushPendingOrders(): Promise<void> {
    if (flushing || !navigator.onLine) {
        return;
    }
    flushing = true;

    try {
        const pending = await listPendingOrders();
        for (const order of pending) {
            try {
                await api.post('/orders', order.payload);
                await removePendingOrder(order.client_local_uuid);
            } catch (error) {
                // Une erreur de validation (422) ne se résoudra pas en rejouant : on la signale
                // sans la supprimer, pour que l'accueil puisse la corriger. Une erreur réseau
                // (fetch throw non-ApiError) laisse la commande en 'pending' pour un prochain essai.
                if (error instanceof ApiError && error.status !== 0) {
                    await markPendingOrderError(order.client_local_uuid, error.message);
                }
            }
        }

        // « À jour » signifie réellement « plus rien en attente » — jamais marqué si une
        // commande reste en file (erreur de validation ou nouvel échec réseau pendant la boucle).
        const remaining = await listPendingOrders();
        if (remaining.length === 0) {
            localStorage.setItem(LAST_SYNCED_KEY, new Date().toISOString());
        }
    } finally {
        flushing = false;
        syncEvents.dispatchEvent(new Event('change'));
    }
}

export function getLastSyncedAt(): string | null {
    return localStorage.getItem(LAST_SYNCED_KEY);
}

window.addEventListener('online', () => void flushPendingOrders());

// Filet de sécurité si l'évènement 'online' est manqué (ex. reprise d'un onglet en veille).
setInterval(() => void flushPendingOrders(), 20_000);

void flushPendingOrders();
