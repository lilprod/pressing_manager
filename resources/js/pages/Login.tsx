import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, Building2, KeyRound, Languages, Moon, ScanLine, ShieldCheck, Sun, User, WifiOff, type LucideIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useSettings } from '../contexts/SettingsContext';
import { useTheme } from '../contexts/ThemeContext';
import { api, ApiError } from '../lib/api';
import { useOnlineStatus } from '../lib/useOnlineStatus';
import BrandMark, { BrandLogo } from '../components/BrandMark';
import { Alert, Spinner } from '../components/ui/Feedback';
import { Pill } from '../components/ui/StatusBadge';
import { button, card, cx, iconButton, input, label } from '../components/ui/styles';

/* Écran « Authentification staff » (Figma SPARK PRESSING, section 01, node 43:3) :
 * univers de marque à gauche (promesse + engagements en ligne), carte de connexion
 * à droite. Sélecteur d'agence (rôles globaux uniquement), « se souvenir de moi » et
 * réinitialisation en libre-service construits le 2026-10-05 — voir CLAUDE.md §2. */

type AgencyLookup =
    | { type: 'idle' | 'checking' }
    | { type: 'unknown' }
    | { type: 'local'; agency: { id: number; name: string } | null }
    | { type: 'global'; agencies: { id: number; name: string }[] };

const LAST_AGENCY_KEY = 'pm.lastLoginAgencyId';

function Commitment({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
    return (
        <li className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-accent-300 ring-1 ring-inset ring-white/15">
                <Icon aria-hidden="true" className="h-4 w-4" />
            </span>
            <span className="text-sm font-medium leading-snug text-white">{text}</span>
        </li>
    );
}

export default function Login() {
    const { user, login, loading } = useAuth();
    const { t, lang, setLang } = useI18n();
    const { theme, toggleTheme } = useTheme();
    const { settings } = useSettings();
    const online = useOnlineStatus();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [remember, setRemember] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [agencyLookup, setAgencyLookup] = useState<AgencyLookup>({ type: 'idle' });
    const [agencyId, setAgencyId] = useState<number | null>(null);

    /* Sélecteur d'agence à la connexion (rôles globaux uniquement) : débounce 500ms sur
     * l'e-mail, réponse neutre anti-énumération (voir `AuthController::agenciesForEmail`). */
    useEffect(() => {
        const term = email.trim();
        if (!term.includes('@')) {
            setAgencyLookup({ type: 'idle' });
            setAgencyId(null);
            return;
        }
        setAgencyLookup({ type: 'checking' });
        const controller = new AbortController();
        const timeout = setTimeout(() => {
            api.post<{ type: string; agency?: { id: number; name: string } | null; agencies?: { id: number; name: string }[] }>('/login/agencies', { email: term })
                .then((res) => {
                    if (res.type === 'local') {
                        setAgencyLookup({ type: 'local', agency: res.agency ?? null });
                        setAgencyId(res.agency?.id ?? null);
                    } else if (res.type === 'global') {
                        const list = res.agencies ?? [];
                        setAgencyLookup({ type: 'global', agencies: list });
                        const lastId = Number(localStorage.getItem(LAST_AGENCY_KEY));
                        setAgencyId(list.some((a) => a.id === lastId) ? lastId : null);
                    } else {
                        setAgencyLookup({ type: 'unknown' });
                        setAgencyId(null);
                    }
                })
                .catch(() => setAgencyLookup({ type: 'idle' }));
        }, 500);
        return () => {
            clearTimeout(timeout);
            controller.abort();
        };
    }, [email]);

    if (!loading && user) {
        return <Navigate to="/" replace />;
    }

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setError(null);
        setSubmitting(true);
        try {
            await login(email, password, { agencyId, remember });
            if (agencyId) {
                localStorage.setItem(LAST_AGENCY_KEY, String(agencyId));
            }
        } catch (err) {
            if (err instanceof ApiError && err.status === 423) {
                setError(err.message);
            } else {
                setError(err instanceof ApiError ? t('auth.loginError') : t('common.error'));
            }
        } finally {
            setSubmitting(false);
        }
    }

    const timeout = settings?.session_timeout_minutes;

    return (
        <div className="flex min-h-screen bg-ink-50 dark:bg-ink-950">
            {/* Univers de marque (écrans larges) */}
            <aside className="relative hidden w-[42%] max-w-[640px] overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 lg:flex lg:flex-col lg:justify-between lg:p-12">
                <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                    <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-400/20 blur-3xl" />
                    <div className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-accent-400/10 blur-3xl" />
                    <svg className="absolute inset-0 h-full w-full opacity-[0.06]" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <pattern id="login-dots" width="28" height="28" patternUnits="userSpaceOnUse">
                                <circle cx="2" cy="2" r="1.5" fill="white" />
                            </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#login-dots)" />
                    </svg>
                </div>

                <BrandMark inverted className="relative" />

                <div className="relative max-w-lg space-y-6">
                    <span className="inline-flex items-center rounded-full bg-accent-400/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent-200 ring-1 ring-inset ring-accent-300/30">
                        {t('login.eyebrow')}
                    </span>
                    <div className="space-y-4">
                        <h2 className="font-display text-4xl font-bold leading-tight text-white xl:text-[44px]">{t('login.heroTitle')}</h2>
                        <p className="text-base leading-relaxed text-brand-100">{t('login.heroText')}</p>
                    </div>
                    <ul className="grid grid-cols-3 gap-4 border-t border-white/10 pt-6">
                        <Commitment icon={ScanLine} text={t('login.commitment.traceability')} />
                        <Commitment icon={WifiOff} text={t('login.commitment.offline')} />
                        <Commitment icon={ShieldCheck} text={t('login.commitment.secure')} />
                    </ul>
                </div>

                <p className="relative text-xs text-brand-200">{t('login.footer')}</p>
            </aside>

            {/* Connexion */}
            <main className="relative flex flex-1 flex-col">
                <div className="relative flex items-center justify-end gap-1 p-4">
                    <button
                        type="button"
                        onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}
                        aria-label={t('lang.toggle')}
                        className={cx(iconButton, 'w-auto gap-1.5 px-2.5 text-xs font-bold')}
                    >
                        <Languages aria-hidden="true" className="h-[18px] w-[18px]" />
                        {lang === 'fr' ? 'FR' : 'EN'}
                    </button>
                    <button type="button" onClick={toggleTheme} aria-label={t('theme.toggle')} className={iconButton}>
                        {theme === 'dark' ? <Sun aria-hidden="true" className="h-[18px] w-[18px]" /> : <Moon aria-hidden="true" className="h-[18px] w-[18px]" />}
                    </button>
                </div>

                <div className="relative flex flex-1 items-center justify-center px-4 pb-16 sm:px-8">
                    <form
                        onSubmit={handleSubmit}
                        className={cx(card, 'w-full max-w-[440px] animate-fade-in space-y-5 p-6 sm:p-8')}
                        aria-labelledby="login-heading"
                    >
                        <BrandLogo className="h-11 w-11 lg:hidden" />

                        <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h1 id="login-heading" className="font-display text-2xl font-bold text-ink-900 dark:text-white">
                                    {t('login.welcome')}
                                </h1>
                                {online ? <Pill tone="emerald">{t('login.online')}</Pill> : <Pill tone="amber">{t('login.offline')}</Pill>}
                            </div>
                            <p className="text-sm text-ink-600 dark:text-ink-350">{t('login.subtitle')}</p>
                        </div>

                        {error && <Alert tone="error">{error}</Alert>}

                        <div className="space-y-4">
                            <div>
                                <label htmlFor="email" className={label}>
                                    {t('auth.email')}
                                </label>
                                <div className="relative">
                                    <User aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                                    <input
                                        id="email"
                                        type="email"
                                        required
                                        autoComplete="username"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className={cx(input, 'pl-10')}
                                    />
                                </div>
                            </div>

                            <div>
                                <label htmlFor="password" className={label}>
                                    {t('auth.password')}
                                </label>
                                <div className="relative">
                                    <KeyRound aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                                    <input
                                        id="password"
                                        type="password"
                                        required
                                        autoComplete="current-password"
                                        aria-describedby="password-help"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className={cx(input, 'pl-10')}
                                    />
                                </div>
                                <p id="password-help" className="mt-1.5 text-xs text-ink-600 dark:text-ink-350">
                                    {t('login.passwordHelp')}
                                </p>
                            </div>

                            {agencyLookup.type === 'local' && agencyLookup.agency && (
                                <p className="flex items-center gap-2 text-xs text-ink-600 dark:text-ink-350">
                                    <Building2 aria-hidden="true" className="h-3.5 w-3.5" />
                                    {t('login.agencyFixed', { agency: agencyLookup.agency.name })}
                                </p>
                            )}

                            {agencyLookup.type === 'global' && agencyLookup.agencies.length > 0 && (
                                <div>
                                    <label htmlFor="agency" className={label}>
                                        {t('login.agencyLabel')}
                                    </label>
                                    <div className="relative">
                                        <Building2 aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                                        <select
                                            id="agency"
                                            value={agencyId ?? ''}
                                            onChange={(e) => setAgencyId(e.target.value ? Number(e.target.value) : null)}
                                            className={cx(input, 'pl-10')}
                                        >
                                            <option value="">{t('login.agencyPlaceholder')}</option>
                                            {agencyLookup.agencies.map((a) => (
                                                <option key={a.id} value={a.id}>
                                                    {a.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-200">
                                    <input
                                        type="checkbox"
                                        checked={remember}
                                        onChange={(e) => setRemember(e.target.checked)}
                                        className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500 dark:border-ink-600"
                                    />
                                    {t('login.remember')}
                                </label>
                                <Link to="/forgot-password" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
                                    {t('login.forgotPassword')}
                                </Link>
                            </div>
                        </div>

                        <button type="submit" disabled={submitting} className={button('accent', 'md', 'group w-full sm:w-auto')}>
                            {submitting ? (
                                <>
                                    <Spinner className="h-4 w-4" />
                                    {t('auth.loggingIn')}
                                </>
                            ) : (
                                <>
                                    {t('auth.login')}
                                    <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                                </>
                            )}
                        </button>

                        <Alert tone="info" icon={ShieldCheck}>
                            <p className="font-semibold">{t('login.securityTitle')}</p>
                            <p className="font-normal">{t('login.lockoutDetail')}</p>
                            {timeout ? <p className="font-normal">{t('login.securityDetail', { minutes: timeout })}</p> : null}
                        </Alert>

                        <p className="border-t border-ink-200/80 pt-4 text-xs text-ink-600 dark:border-ink-800 dark:text-ink-350">{t('login.assistance')}</p>
                    </form>
                </div>
            </main>
        </div>
    );
}
