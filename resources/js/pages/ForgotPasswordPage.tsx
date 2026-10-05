import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { api } from '../lib/api';
import BrandMark from '../components/BrandMark';
import { Alert, Spinner } from '../components/ui/Feedback';
import { button, card, cx, input, label } from '../components/ui/styles';

/**
 * Réinitialisation de mot de passe en libre-service, étape 1 — voir CLAUDE.md
 * « 01 Authentification ». Réponse toujours générique côté serveur (anti-énumération) :
 * cet écran affiche le même message de confirmation, que le compte existe ou non.
 */
export default function ForgotPasswordPage() {
    const { t } = useI18n();
    const [email, setEmail] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [sent, setSent] = useState(false);

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setSubmitting(true);
        try {
            await api.post('/password/forgot', { email });
        } catch {
            // Volontairement ignoré : le serveur répond toujours 200 avec un message
            // générique, même en cas de throttle — pas de distinction utile à afficher.
        } finally {
            setSubmitting(false);
            setSent(true);
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4 dark:bg-ink-950">
            <div className={cx(card, 'w-full max-w-[440px] space-y-5 p-6 sm:p-8')}>
                <BrandMark className="h-11 w-11" />
                <div className="space-y-1.5">
                    <h1 className="font-display text-2xl font-bold text-ink-900 dark:text-white">{t('forgotPassword.title')}</h1>
                    <p className="text-sm text-ink-600 dark:text-ink-350">{t('forgotPassword.subtitle')}</p>
                </div>

                {sent ? (
                    <Alert tone="success">{t('forgotPassword.sent')}</Alert>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="email" className={label}>
                                {t('auth.email')}
                            </label>
                            <div className="relative">
                                <Mail aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
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
                        <button type="submit" disabled={submitting} className={button('accent', 'md', 'w-full')}>
                            {submitting ? <Spinner className="h-4 w-4" /> : t('forgotPassword.submit')}
                        </button>
                    </form>
                )}

                <Link to="/login" className="flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
                    <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                    {t('forgotPassword.backToLogin')}
                </Link>
            </div>
        </div>
    );
}
