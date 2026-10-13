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
// Intervalle réglable par agence (Paramètres opérationnels → « Intervalle de
// synchronisation ») : appliqué dès que le comptoir charge les réglages de l'agence,
// mémorisé sur l'appareil pour les rechargements suivants. 20 s par défaut.
const SYNC_INTERVAL_KEY = 'pm.syncIntervalMinutes';
let timer: number | undefined;

function startTimer(ms: number) {
    if (timer !== undefined) window.clearInterval(timer);
    timer = window.setInterval(() => void flushPendingOrders(), ms);
}

export function configureSyncInterval(minutes: number | null | undefined): void {
    try {
        if (minutes && minutes > 0) localStorage.setItem(SYNC_INTERVAL_KEY, String(minutes));
        else localStorage.removeItem(SYNC_INTERVAL_KEY);
    } catch {
        /* stockage indisponible : on garde l'intervalle courant */
    }
    startTimer(minutes && minutes > 0 ? minutes * 60_000 : 20_000);
}

function storedIntervalMs(): number {
    try {
        const minutes = Number(localStorage.getItem(SYNC_INTERVAL_KEY));
        return minutes > 0 ? minutes * 60_000 : 20_000;
    } catch {
        return 20_000;
    }
}

startTimer(storedIntervalMs());

void flushPendingOrders();
