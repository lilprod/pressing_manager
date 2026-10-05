import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface PendingOrderPayload {
    agency_id?: number;
    client_id: number;
    client_local_uuid: string;
    is_express?: boolean;
    promised_at?: string | null;
    notes?: string | null;
    discount_amount?: number;
    items: Array<{
        service_id: number;
        quantity: number;
        weight_kg?: number;
        description?: string | null;
        intake_condition_ids?: number[];
        intake_notes?: string | null;
        treatment_type_id?: number;
    }>;
    // Encaissement optionnel intégré à la création (refonte flux comptoir) — voyage
    // dans le même payload mis en file et rejoué tel quel par /orders au retour réseau.
    payment_method?: 'espece' | 'carte' | 'flooz' | 'tmoney';
    payment_amount?: number;
    payment_reference?: string;
}

export interface PendingOrder {
    client_local_uuid: string;
    payload: PendingOrderPayload;
    created_at: string;
    status: 'pending' | 'error';
    error?: string;
    /** Aperçu client-side pour l'affichage avant synchronisation (nom client, total estimé). */
    preview: { client_label: string; total_amount: number; items_count: number };
}

interface PressingDb extends DBSchema {
    pending_orders: {
        key: string;
        value: PendingOrder;
    };
}

let dbPromise: Promise<IDBPDatabase<PressingDb>> | null = null;

function getDb() {
    if (!dbPromise) {
        dbPromise = openDB<PressingDb>('pressing-manager', 1, {
            upgrade(db) {
                db.createObjectStore('pending_orders', { keyPath: 'client_local_uuid' });
            },
        });
    }
    return dbPromise;
}

export async function queuePendingOrder(order: PendingOrder): Promise<void> {
    const db = await getDb();
    await db.put('pending_orders', order);
}

export async function listPendingOrders(): Promise<PendingOrder[]> {
    const db = await getDb();
    return db.getAll('pending_orders');
}

export async function removePendingOrder(clientLocalUuid: string): Promise<void> {
    const db = await getDb();
    await db.delete('pending_orders', clientLocalUuid);
}

export async function markPendingOrderError(clientLocalUuid: string, message: string): Promise<void> {
    const db = await getDb();
    const record = await db.get('pending_orders', clientLocalUuid);
    if (record) {
        record.status = 'error';
        record.error = message;
        await db.put('pending_orders', record);
    }
}
