import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { ArrowRight, CloudOff, Languages, LockKeyhole, Mail, Moon, QrCode, Sun, Zap, type LucideIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useTheme } from '../contexts/ThemeContext';
import { ApiError } from '../lib/api';
import BrandMark, { BrandLogo } from '../components/BrandMark';
import { Alert, Spinner } from '../components/ui/Feedback';
import { button, cx, iconButton, inputLg, label } from '../components/ui/styles';

function Feature({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
    return (
        <li className="flex gap-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-inset ring-white/20">
                <Icon aria-hidden="true" className="h-5 w-5" />
            </span>
            <div>
                <p className="font-semibold text-white">{title}</p>
                <p className="text-sm text-brand-100">{text}</p>
            </div>
        </li>
    );
}

export default function Login() {
    const { user, login, loading } = useAuth();
    const { t, lang, setLang } = useI18n();
    const { theme, toggleTheme } = useTheme();
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

    return (
        <div className="flex min-h-screen bg-white dark:bg-ink-950">
            {/* Panneau de marque (écrans larges) */}
            <aside className="relative hidden w-[46%] max-w-2xl overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 lg:flex lg:flex-col lg:justify-between lg:p-12">
                <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                    <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-400/20 blur-3xl" />
                    <div className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-brand-300/15 blur-3xl" />
                    <svg className="absolute inset-0 h-full w-full opacity-[0.07]" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <pattern id="login-dots" width="28" height="28" patternUnits="userSpaceOnUse">
                                <circle cx="2" cy="2" r="1.5" fill="white" />
                            </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#login-dots)" />
                    </svg>
                    <div className="absolute bottom-24 right-12 h-40 w-40 rounded-full border border-white/10" />
                    <div className="absolute bottom-40 right-40 h-16 w-16 rounded-full border border-white/10" />
                    <div className="absolute right-24 top-1/3 h-24 w-24 rounded-full bg-white/5" />
                </div>

                <BrandMark inverted className="relative" />

                <div className="relative max-w-md space-y-8">
                    <div className="space-y-4">
                        <h2 className="font-display text-4xl font-extrabold leading-tight text-white xl:text-5xl">{t('login.heroTitle')}</h2>
                        <p className="text-lg text-brand-100">{t('login.heroText')}</p>
                    </div>
                    <ul className="space-y-5">
                        <Feature icon={Zap} title={t('login.feature1.title')} text={t('login.feature1.text')} />
                        <Feature icon={QrCode} title={t('login.feature2.title')} text={t('login.feature2.text')} />
                        <Feature icon={CloudOff} title={t('login.feature3.title')} text={t('login.feature3.text')} />
                    </ul>
                </div>

                <p className="relative text-sm text-brand-100">{t('login.footer')}</p>
            </aside>

            {/* Formulaire */}
            <main className="relative flex flex-1 flex-col">
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-brand-50 to-transparent lg:hidden dark:from-brand-400/10"
                />

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

                <div className="relative flex flex-1 items-center justify-center px-5 pb-16 sm:px-8">
                    <form onSubmit={handleSubmit} className="w-full max-w-sm animate-fade-in space-y-6" aria-labelledby="login-heading">
                        <div className="space-y-5">
                            <BrandLogo className="h-12 w-12 lg:hidden" />
                            <div className="space-y-1.5">
                                <h1 id="login-heading" className="font-display text-3xl font-extrabold text-ink-900 dark:text-white">
                                    {t('login.welcome')}
                                </h1>
                                <p className="text-ink-600 dark:text-ink-350">{t('login.subtitle')}</p>
                            </div>
                        </div>

                        {error && <Alert tone="error">{error}</Alert>}

                        <div className="space-y-4">
                            <div>
                                <label htmlFor="email" className={label}>
                                    {t('auth.email')}
                                </label>
                                <div className="relative">
                                    <Mail aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                                    <input
                                        id="email"
                                        type="email"
                                        required
                                        autoComplete="username"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className={cx(inputLg, 'pl-11')}
                                    />
                                </div>
                            </div>

                            <div>
                                <label htmlFor="password" className={label}>
                                    {t('auth.password')}
                                </label>
                                <div className="relative">
                                    <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                                    <input
                                        id="password"
                                        type="password"
                                        required
                                        autoComplete="current-password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className={cx(inputLg, 'pl-11')}
                                    />
                                </div>
                            </div>
                        </div>

                        <button type="submit" disabled={submitting} className={button('primary', 'lg', 'group w-full')}>
                            {submitting ? (
                                <>
                                    <Spinner className="h-5 w-5" />
                                    {t('auth.loggingIn')}
                                </>
                            ) : (
                                <>
                                    {t('auth.login')}
                                    <ArrowRight aria-hidden="true" className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
                                </>
                            )}
                        </button>
                    </form>
                </div>
            </main>
        </div>
    );
}
