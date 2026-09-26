import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import fr from '../i18n/fr.json';
import en from '../i18n/en.json';

type Dict = Record<string, string>;

const DICTS: Record<'fr' | 'en', Dict> = { fr, en };
const LANG_KEY = 'pm.lang';

interface I18nContextValue {
    lang: 'fr' | 'en';
    setLang: (lang: 'fr' | 'en') => void;
    t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
    const [lang, setLangState] = useState<'fr' | 'en'>(() => {
        const stored = localStorage.getItem(LANG_KEY);
        return stored === 'en' ? 'en' : 'fr';
    });

    const setLang = useCallback((next: 'fr' | 'en') => {
        localStorage.setItem(LANG_KEY, next);
        setLangState(next);
        document.documentElement.lang = next;
    }, []);

    const t = useCallback(
        (key: string, vars?: Record<string, string | number>) => {
            let text = DICTS[lang][key] ?? DICTS.fr[key] ?? key;
            if (vars) {
                for (const [k, v] of Object.entries(vars)) {
                    text = text.replace(`{${k}}`, String(v));
                }
            }
            return text;
        },
        [lang],
    );

    const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
    const ctx = useContext(I18nContext);
    if (!ctx) {
        throw new Error('useI18n must be used within I18nProvider');
    }
    return ctx;
}
