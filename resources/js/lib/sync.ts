import { api, ApiError } from './api';
import { listPendingOrders, markPendingOrderError, removePendingOrder, resetPendingOrder, type PendingOrder } from './offlineDb';

/** Opération locale synchronisée avec succès — historique conservé sur l'appareil (50 dernières),
 * pour afficher la renumérotation numéro local → numéro serveur et le rapprochement des encaissements. */
export interface SyncedOperation {
    client_local_uuid: string;
    local_reference: string | null;
    order_id: number;
    order_number: number | string;
    client_label: string;
    total_amount: number;
    items_count: number;
    queued_at: string;
    synced_at: string;
    payment_requested: boolean;
    payment_recorded: boolean;
}

/** Progression de la passe de synchronisation en cours (null hors passe). */
export interface SyncProgress {
    total: number;
    done: number;
    failed: number;
}

const HISTORY_KEY = 'pm.syncHistory';
let progress: SyncProgress | null = null;

export function getSyncProgress(): SyncProgress | null {
    return progress;
}

export function getSyncHistory(): SyncedOperation[] {
    try {
        return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as SyncedOperation[];
    } catch {
        return [];
    }
}

function recordSynced(order: PendingOrder, response: { id: number; order_number: number | string; invoice?: Array<{ payments?: unknown[] }> | null }) {
    const entry: SyncedOperation = {
        client_local_uuid: order.client_local_uuid,
        local_reference: order.preview.local_reference ?? null,
        order_id: response.id,
        order_number: response.order_number,
        client_label: order.preview.client_label,
        total_amount: order.preview.total_amount,
        items_count: order.preview.items_count,
        queued_at: order.created_at,
        synced_at: new Date().toISOString(),
        payment_requested: Boolean(order.payload.payment_method),
        payment_recorded: (response.invoice?.[0]?.payments?.length ?? 0) > 0,
    };
    try {
        const history = getSyncHistory().filter((h) => h.client_local_uuid !== entry.client_local_uuid);
        localStorage.setItem(HISTORY_KEY, JSON.stringify([entry, ...history].slice(0, 50)));
    } catch {
        /* stockage indisponible : l'historique est un confort, pas une donnée de référence */
    }
}

/** Résolution de conflit : remet l'opération en file (payload éventuellement corrigé) puis relance. */
export async function retryPendingOrder(order: PendingOrder, mode: 'as_is' | 'without_promotion' | 'without_discount' = 'as_is'): Promise<void> {
    let payload = order.payload;
    if (mode === 'without_promotion') {
        payload = { ...payload, promotion_code: undefined };
    } else if (mode === 'without_discount') {
        payload = { ...payload, promotion_code: undefined, discount_amount: 0, discount_is_loyalty_auto: false };
    }
    await resetPendingOrder(order.client_local_uuid, mode === 'as_is' ? undefined : payload);
    syncEvents.dispatchEvent(new Event('change'));
    await flushPendingOrders();
}

/** Retire définitivement une opération de la file locale (après confirmation de l'opérateur). */
export async function discardPendingOrder(clientLocalUuid: string): Promise<void> {
    await removePendingOrder(clientLocalUuid);
    syncEvents.dispatchEvent(new Event('change'));
}

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
        const pending = (await listPendingOrders()).filter((o) => o.status === 'pending');
        progress = { total: pending.length, done: 0, failed: 0 };
        syncEvents.dispatchEvent(new Event('change'));
        for (const order of pending) {
            try {
                const created = await api.post<{ id: number; order_number: number | string; invoice?: Array<{ payments?: unknown[] }> | null }>('/orders', order.payload);
                recordSynced(order, created);
                await removePendingOrder(order.client_local_uuid);
                progress.done += 1;
            } catch (error) {
                progress.failed += 1;
                // Une erreur de validation (422) ne se résoudra pas en rejouant : on la signale
                // sans la supprimer, pour que l'accueil puisse la corriger. Une erreur réseau
                // (fetch throw non-ApiError) laisse la commande en 'pending' pour un prochain essai.
                if (error instanceof ApiError && error.status !== 0) {
                    await markPendingOrderError(order.client_local_uuid, error.message);
                }
            }
            syncEvents.dispatchEvent(new Event('change'));
        }

        // « À jour » signifie réellement « plus rien en attente » — jamais marqué si une
        // commande reste en file (erreur de validation ou nouvel échec réseau pendant la boucle).
        const remaining = await listPendingOrders();
        if (remaining.length === 0) {
            localStorage.setItem(LAST_SYNCED_KEY, new Date().toISOString());
        }
    } finally {
        flushing = false;
        progress = null;
        syncEvents.dispatchEvent(new Event('change'));
    }
}

export function getSyncIntervalMinutes(): number | null {
    try {
        const minutes = Number(localStorage.getItem('pm.syncIntervalMinutes'));
        return minutes > 0 ? minutes : null;
    } catch {
        return null;
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
