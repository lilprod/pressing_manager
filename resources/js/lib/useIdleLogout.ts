import { useEffect, useRef } from 'react';

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'] as const;
const CHECK_INTERVAL_MS = 30_000;

/**
 * Déconnecte automatiquement après `timeoutMinutes` sans activité (souris, clavier,
 * défilement, tactile) — durée pilotée par les Paramètres (session_timeout_minutes).
 */
export function useIdleLogout(timeoutMinutes: number | null | undefined, onIdle: () => void, enabled: boolean): void {
    const lastActivityRef = useRef(Date.now());

    useEffect(() => {
        if (!enabled || !timeoutMinutes) return;

        lastActivityRef.current = Date.now();
        const markActive = () => {
            lastActivityRef.current = Date.now();
        };

        ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, markActive, { passive: true }));

        const intervalId = window.setInterval(() => {
            if (Date.now() - lastActivityRef.current >= timeoutMinutes * 60_000) {
                onIdle();
            }
        }, CHECK_INTERVAL_MS);

        return () => {
            ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, markActive));
            window.clearInterval(intervalId);
        };
    }, [timeoutMinutes, enabled, onIdle]);
}
