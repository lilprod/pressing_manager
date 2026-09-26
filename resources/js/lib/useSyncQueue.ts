import { useEffect, useState } from 'react';
import { listPendingOrders, type PendingOrder } from './offlineDb';
import { syncEvents } from './sync';

export function useSyncQueue(): PendingOrder[] {
    const [orders, setOrders] = useState<PendingOrder[]>([]);

    useEffect(() => {
        let mounted = true;
        const refresh = () => {
            void listPendingOrders().then((list) => {
                if (mounted) {
                    setOrders(list);
                }
            });
        };

        refresh();
        syncEvents.addEventListener('change', refresh);
        return () => {
            mounted = false;
            syncEvents.removeEventListener('change', refresh);
        };
    }, []);

    return orders;
}
