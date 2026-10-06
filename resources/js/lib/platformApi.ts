/**
 * Client API dédié à la console superadmin — royaume d'authentification séparé du
 * tenant (voir config/auth.php, guard `platform`). Fichier distinct de lib/api.ts
 * (pas un client paramétré) à dessein : rend l'isolation des guards visible aussi
 * côté front, aucun chemin de code ne peut envoyer un jeton plateforme vers /api/*.
 */
const TOKEN_KEY = 'pm.platform.token';

export class PlatformApiError extends Error {
    status: number;
    errors?: Record<string, string[]>;

    constructor(status: number, message: string, errors?: Record<string, string[]>) {
        super(message);
        this.status = status;
        this.errors = errors;
    }
}

export function getPlatformToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

export function setPlatformToken(token: string | null): void {
    if (token) {
        localStorage.setItem(TOKEN_KEY, token);
    } else {
        localStorage.removeItem(TOKEN_KEY);
    }
}

interface RequestOptions {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const token = getPlatformToken();

    const response = await fetch(`/api/platform${path}`, {
        method: options.method ?? 'GET',
        headers: {
            Accept: 'application/json',
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (response.status === 204) {
        return undefined as T;
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
        const message = (data && (data.message as string)) || `Erreur ${response.status}`;
        throw new PlatformApiError(response.status, message, data?.errors);
    }

    return data as T;
}

export const platformApi = {
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
    patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
    async blob(path: string): Promise<Blob> {
        const token = getPlatformToken();
        const response = await fetch(`/api/platform${path}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!response.ok) {
            throw new PlatformApiError(response.status, `Erreur ${response.status}`);
        }
        return response.blob();
    },
};
