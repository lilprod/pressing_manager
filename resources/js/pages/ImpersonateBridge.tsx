import { useEffect, useState } from 'react';
import { setToken } from '../lib/api';

/**
 * Phase 4 (impersonation support) : pont minimal qui reçoit le jeton tenant émis par
 * `POST /platform/pressings/{id}/impersonate` via la query string, le stocke comme un
 * jeton de connexion ordinaire (`pm.token`), puis redirige vers le tableau de bord.
 * Ouvert dans un nouvel onglet depuis la console superadmin — ne touche jamais au
 * jeton plateforme (`pm.platform.token`, stockage séparé).
 */
export default function ImpersonateBridge() {
    const [error, setError] = useState(false);

    useEffect(() => {
        const token = new URLSearchParams(window.location.search).get('token');
        if (!token) {
            setError(true);
            return;
        }
        setToken(token);
        window.location.href = '/dashboard';
    }, []);

    if (error) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4 dark:bg-ink-950">
                <p className="text-sm text-ink-700 dark:text-ink-300">Jeton d'impersonation manquant ou invalide.</p>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4 dark:bg-ink-950">
            <p className="text-sm text-ink-700 dark:text-ink-300">Connexion en cours…</p>
        </div>
    );
}
