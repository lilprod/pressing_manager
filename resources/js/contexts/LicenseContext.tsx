import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, licenseEvents } from '../lib/api';
import { useAuth } from './AuthContext';
import type { License } from '../types';

interface LicenseContextValue {
    license: License | null;
    loading: boolean;
    refresh: () => Promise<void>;
}

const LicenseContext = createContext<LicenseContextValue | null>(null);

export function LicenseProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const [license, setLicense] = useState<License | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        try {
            const current = await api.get<License>('/license');
            setLicense(current);
        } catch {
            setLicense(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (user) {
            void refresh();
        } else {
            setLoading(false);
        }
    }, [user, refresh]);

    useEffect(() => {
        const handler = () => void refresh();
        licenseEvents.addEventListener('blocked', handler);
        return () => licenseEvents.removeEventListener('blocked', handler);
    }, [refresh]);

    const value = useMemo(() => ({ license, loading, refresh }), [license, loading, refresh]);

    return <LicenseContext.Provider value={value}>{children}</LicenseContext.Provider>;
}

export function useLicense(): LicenseContextValue {
    const ctx = useContext(LicenseContext);
    if (!ctx) {
        throw new Error('useLicense must be used within LicenseProvider');
    }
    return ctx;
}
