import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

const THEME_KEY = 'pm.theme';

interface ThemeContextValue {
    theme: 'light' | 'dark';
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setTheme] = useState<'light' | 'dark'>(() =>
        document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    );

    const toggleTheme = useCallback(() => {
        setTheme((current) => {
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.classList.toggle('dark', next === 'dark');
            localStorage.setItem(THEME_KEY, next);
            return next;
        });
    }, []);

    const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
    const ctx = useContext(ThemeContext);
    if (!ctx) {
        throw new Error('useTheme must be used within ThemeProvider');
    }
    return ctx;
}
