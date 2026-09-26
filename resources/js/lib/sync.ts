import { api, ApiError } from './api';
import { listPendingOrders, markPendingOrderError, removePendingOrder } from './offlineDb';

export const syncEvents = new EventTarget();

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
    } finally {
        flushing = false;
        syncEvents.dispatchEvent(new Event('change'));
    }
}

window.addEventListener('online', () => void flushPendingOrders());

// Filet de sécurité si l'évènement 'online' est manqué (ex. reprise d'un onglet en veille).
setInterval(() => void flushPendingOrders(), 20_000);

void flushPendingOrders();
