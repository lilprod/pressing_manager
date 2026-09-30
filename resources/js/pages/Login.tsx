import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { ArrowRight, KeyRound, Languages, Moon, ScanLine, ShieldCheck, Sun, User, WifiOff, type LucideIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useSettings } from '../contexts/SettingsContext';
import { useTheme } from '../contexts/ThemeContext';
import { ApiError } from '../lib/api';
import { useOnlineStatus } from '../lib/useOnlineStatus';
import BrandMark, { BrandLogo } from '../components/BrandMark';
import { Alert, Spinner } from '../components/ui/Feedback';
import { Pill } from '../components/ui/StatusBadge';
import { button, card, cx, iconButton, input, label } from '../components/ui/styles';

/* Écran « Authentification staff » (Figma SPARK PRESSING, section 01, node 43:3) :
 * univers de marque à gauche (promesse + engagements en ligne), carte de connexion
 * à droite. Les éléments de la maquette sans support backend (choix d'agence à la
 * connexion, « se souvenir de moi », réinitialisation du mot de passe en libre-service
 * par e-mail/SMS) sont volontairement omis — voir CLAUDE.md §2. */

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
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    if (!loading && user) {
        return <Navigate to="/" replace />;
    }

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setError(null);
        setSubmitting(true);
        try {
            await login(email, password);
        } catch (err) {
            setError(err instanceof ApiError ? t('auth.loginError') : t('common.error'));
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
                        </div>

                        <button type="submit" disabled={submitting} className={button('primary', 'md', 'group w-full sm:w-auto')}>
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

                        {timeout ? (
                            <Alert tone="info" icon={ShieldCheck}>
                                <p className="font-semibold">{t('login.securityTitle')}</p>
                                <p className="font-normal">{t('login.securityDetail', { minutes: timeout })}</p>
                            </Alert>
                        ) : null}

                        <p className="border-t border-ink-200/80 pt-4 text-xs text-ink-600 dark:border-ink-800 dark:text-ink-350">{t('login.assistance')}</p>
                    </form>
                </div>
            </main>
        </div>
    );
}
