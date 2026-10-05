import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, authEvents, getToken, setToken } from '../lib/api';
import type { Agency, User } from '../types';

const AGENCY_KEY = 'pm.selectedAgencyId';

interface LoginOptions {
    agencyId?: number | null;
    remember?: boolean;
}

interface AuthContextValue {
    user: User | null;
    agencies: Agency[];
    loading: boolean;
    login: (email: string, password: string, options?: LoginOptions) => Promise<void>;
    logout: () => Promise<void>;
    /** Recharge l'utilisateur courant (ex. après modification du profil ou changement de mot de passe). */
    refreshUser: () => Promise<void>;
    /** Agence effective : forcée pour un rôle local, sélectionnée pour un rôle global. */
    activeAgencyId: number | null;
    setActiveAgencyId: (id: number | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [agencies, setAgencies] = useState<Agency[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeAgencyId, setActiveAgencyIdState] = useState<number | null>(() => {
        const stored = localStorage.getItem(AGENCY_KEY);
        return stored ? Number(stored) : null;
    });

    const loadSession = useCallback(async () => {
        // `/impersonate` ne fait que déposer un jeton puis rediriger (voir `ImpersonateBridge.tsx`) :
        // si ce provider tentait aussi `GET /me` ici, la navigation qui suit annulerait cette requête
        // en plein vol, et le `catch` ci-dessous effacerait le jeton qui vient d'être posé avant même
        // que la page de destination ne se charge.
        if (!getToken() || window.location.pathname === '/impersonate') {
            setLoading(false);
            return;
        }
        try {
            const me = await api.get<User>('/me');
            setUser(me);
            if (me.agency_id !== null) {
                setActiveAgencyIdState(me.agency_id);
            }
            if (me.agency_id === null) {
                const list = await api.get<Agency[]>('/agencies');
                setAgencies(list);
            }
        } catch {
            setToken(null);
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSession();
    }, [loadSession]);

    const login = useCallback(async (email: string, password: string, options?: LoginOptions) => {
        const result = await api.post<{ token: string; user: User; resolved_agency_id: number | null }>('/login', {
            email,
            password,
            device_name: navigator.userAgent.slice(0, 100) || 'web',
            agency_id: options?.agencyId ?? undefined,
            remember: options?.remember ?? false,
        });
        setToken(result.token);
        setUser(result.user);
        if (result.user.agency_id !== null) {
            setActiveAgencyIdState(result.user.agency_id);
        } else {
            const list = await api.get<Agency[]>('/agencies');
            setAgencies(list);
            // Ferme le gap « agence de session » : un rôle global qui a choisi une agence
            // au login n'a pas besoin de rouvrir le sélecteur d'en-tête après coup.
            if (result.resolved_agency_id !== null) {
                setActiveAgencyIdState(result.resolved_agency_id);
                localStorage.setItem(AGENCY_KEY, String(result.resolved_agency_id));
            }
        }
    }, []);

    const logout = useCallback(async () => {
        try {
            await api.post('/logout');
        } catch {
            // Le jeton est peut-être déjà invalide côté serveur : on nettoie quand même côté client.
        }
        setToken(null);
        setUser(null);
        setAgencies([]);
    }, []);

    useEffect(() => {
        // Jeton expiré/révoqué (401) : nettoyer côté client sans réappeler /logout (le
        // jeton est déjà invalide côté serveur) puis rediriger — voir CLAUDE.md
        // « Se souvenir de moi » pour pourquoi ce handler global n'existait pas avant.
        const handler = () => {
            setToken(null);
            setUser(null);
            setAgencies([]);
            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        };
        authEvents.addEventListener('expired', handler);
        return () => authEvents.removeEventListener('expired', handler);
    }, []);

    const refreshUser = useCallback(async () => {
        const me = await api.get<User>('/me');
        setUser(me);
    }, []);

    const setActiveAgencyId = useCallback((id: number | null) => {
        setActiveAgencyIdState(id);
        if (id) {
            localStorage.setItem(AGENCY_KEY, String(id));
        } else {
            localStorage.removeItem(AGENCY_KEY);
        }
    }, []);

    const value = useMemo(
        () => ({ user, agencies, loading, login, logout, refreshUser, activeAgencyId, setActiveAgencyId }),
        [user, agencies, loading, login, logout, refreshUser, activeAgencyId, setActiveAgencyId],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return ctx;
}
