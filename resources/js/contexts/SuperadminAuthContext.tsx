import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getPlatformToken, platformApi, setPlatformToken } from '../lib/platformApi';
import type { PlatformUser } from '../types';

type LoginChallenge =
    | { mfa_required: true; challenge: string }
    | { mfa_setup_required: true; challenge: string; otpauth_uri: string; qr_code_data_uri: string };

interface SuperadminAuthContextValue {
    user: PlatformUser | null;
    loading: boolean;
    /** Nom et logo de la console (réglables dans Paramètres) ; vide / null tant que non chargés. */
    appName: string;
    logoUrl: string | null;
    requestLogin: (email: string, password: string) => Promise<LoginChallenge>;
    verifyMfa: (challenge: string, code: string) => Promise<void>;
    confirmMfaSetup: (challenge: string, code: string) => Promise<{ recoveryCodes: string[] }>;
    logout: () => Promise<void>;
    refresh: () => Promise<void>;
}

const SuperadminAuthContext = createContext<SuperadminAuthContextValue | null>(null);

export function SuperadminAuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<PlatformUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [appName, setAppName] = useState('');
    const [logoUrl, setLogoUrl] = useState<string | null>(null);

    const loadIdentity = useCallback(async () => {
        try {
            const identity = await platformApi.get<{ app_name: string; logo_url: string | null }>('/settings/identity');
            setAppName(identity.app_name);
            setLogoUrl(identity.logo_url);
        } catch {
            // Identité indisponible : la console reste utilisable, sans nom affiché.
        }
    }, []);

    useEffect(() => {
        void loadIdentity();
    }, [loadIdentity]);

    useEffect(() => {
        if (!getPlatformToken()) {
            setLoading(false);
            return;
        }
        platformApi
            .get<PlatformUser>('/me')
            .then(setUser)
            .catch(() => {
                setPlatformToken(null);
                setUser(null);
            })
            .finally(() => setLoading(false));
    }, []);

    const requestLogin = useCallback(async (email: string, password: string) => {
        return platformApi.post<LoginChallenge>('/login', { email, password });
    }, []);

    const verifyMfa = useCallback(async (challenge: string, code: string) => {
        const result = await platformApi.post<{ token: string; user: PlatformUser }>('/login/verify', { challenge, code });
        setPlatformToken(result.token);
        setUser(result.user);
    }, []);

    const confirmMfaSetup = useCallback(async (challenge: string, code: string) => {
        const result = await platformApi.post<{ token: string; user: PlatformUser; recovery_codes: string[] }>('/login/setup', {
            challenge,
            code,
        });
        setPlatformToken(result.token);
        setUser(result.user);
        return { recoveryCodes: result.recovery_codes };
    }, []);

    const refresh = useCallback(async () => {
        await loadIdentity();
        if (!getPlatformToken()) return;
        const fresh = await platformApi.get<PlatformUser>('/me');
        setUser(fresh);
    }, [loadIdentity]);

    const logout = useCallback(async () => {
        try {
            await platformApi.post('/logout');
        } catch {
            // Jeton déjà invalide côté serveur : on nettoie quand même côté client.
        }
        setPlatformToken(null);
        setUser(null);
    }, []);

    const value = useMemo(
        () => ({ user, loading, appName, logoUrl, requestLogin, verifyMfa, confirmMfaSetup, logout, refresh }),
        [user, loading, appName, logoUrl, requestLogin, verifyMfa, confirmMfaSetup, logout, refresh],
    );

    return <SuperadminAuthContext.Provider value={value}>{children}</SuperadminAuthContext.Provider>;
}

export function useSuperadminAuth(): SuperadminAuthContextValue {
    const ctx = useContext(SuperadminAuthContext);
    if (!ctx) {
        throw new Error('useSuperadminAuth must be used within SuperadminAuthProvider');
    }
    return ctx;
}
