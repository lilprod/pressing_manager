import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { AppSettings } from '../types';

interface SettingsContextValue {
    settings: AppSettings | null;
    refresh: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/** Identité globale du pressing (nom, adresse, logo, favicon) — publique, disponible même avant connexion. */
export function SettingsProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<AppSettings | null>(null);

    const refresh = useCallback(async () => {
        try {
            const current = await api.get<AppSettings>('/settings');
            setSettings(current);
        } catch {
            setSettings(null);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    // Titre de l'onglet = nom du pressing ; la console superadmin garde le sien (SuperadminLayout).
    useEffect(() => {
        if (!settings?.pressing_name || window.location.pathname.startsWith('/superadmin')) return;
        document.title = settings.pressing_name;
    }, [settings?.pressing_name]);

    const value = useMemo(() => ({ settings, refresh }), [settings, refresh]);

    return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
    const ctx = useContext(SettingsContext);
    if (!ctx) {
        throw new Error('useSettings must be used within SettingsProvider');
    }
    return ctx;
}
