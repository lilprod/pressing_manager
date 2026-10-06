import { useEffect, useState } from 'react';
import { getLastSyncedAt, syncEvents } from './sync';

export function useOnlineStatus(): boolean {
    const [online, setOnline] = useState(navigator.onLine);

    useEffect(() => {
        const handleOnline = () => setOnline(true);
        const handleOffline = () => setOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    return online;
}

/** Horodatage réel de la dernière fois où la file hors ligne a été vidée avec
 * succès (`sync.ts`) — `null` si aucune synchronisation réussie n'a encore eu
 * lieu sur cet appareil, jamais une heure fabriquée. */
export function useLastSyncedAt(): string | null {
    const [value, setValue] = useState<string | null>(() => getLastSyncedAt());

    useEffect(() => {
        const refresh = () => setValue(getLastSyncedAt());
        syncEvents.addEventListener('change', refresh);
        return () => syncEvents.removeEventListener('change', refresh);
    }, []);

    return value;
}
