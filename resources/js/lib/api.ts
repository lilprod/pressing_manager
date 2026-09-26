const TOKEN_KEY = 'pm.token';

/** Émis à chaque réponse 402 (licence en grâce/bloquée) pour que LicenseContext se resynchronise. */
export const licenseEvents = new EventTarget();

export class ApiError extends Error {
    status: number;
    errors?: Record<string, string[]>;

    constructor(status: number, message: string, errors?: Record<string, string[]>) {
        super(message);
        this.status = status;
        this.errors = errors;
    }
}

export function getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
    if (token) {
        localStorage.setItem(TOKEN_KEY, token);
    } else {
        localStorage.removeItem(TOKEN_KEY);
    }
}

interface RequestOptions {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
    signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const token = getToken();

    const response = await fetch(`/api${path}`, {
        method: options.method ?? 'GET',
        signal: options.signal,
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
        if (response.status === 402) {
            licenseEvents.dispatchEvent(new Event('blocked'));
        }
        throw new ApiError(response.status, message, data?.errors);
    }

    return data as T;
}

async function requestForm<T>(path: string, formData: FormData): Promise<T> {
    const token = getToken();

    const response = await fetch(`/api${path}`, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
        const message = (data && (data.message as string)) || `Erreur ${response.status}`;
        if (response.status === 402) {
            licenseEvents.dispatchEvent(new Event('blocked'));
        }
        throw new ApiError(response.status, message, data?.errors);
    }

    return data as T;
}

export const api = {
    get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
    post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
    postForm: <T>(path: string, formData: FormData) => requestForm<T>(path, formData),
    patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
    delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
    async blob(path: string): Promise<Blob> {
        const token = getToken();
        const response = await fetch(`/api${path}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!response.ok) {
            throw new ApiError(response.status, `Erreur ${response.status}`);
        }
        return response.blob();
    },
};
