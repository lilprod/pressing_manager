import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { api, ApiError } from '../lib/api';
import BrandMark from '../components/BrandMark';
import { Alert, Spinner } from '../components/ui/Feedback';
import { button, card, cx, input, label } from '../components/ui/styles';

/**
 * Réinitialisation de mot de passe en libre-service, étape 2 — route publique
 * `/reset-password?token=...` (hors `ProtectedLayout`, même patron que
 * `ImpersonateBridge.tsx`). Le jeton n'est jamais vérifié côté client : seul
 * `POST /password/reset` tranche, le client se contente d'afficher sa réponse.
 */
export default function ResetPasswordPage() {
    const { t } = useI18n();
    const token = new URLSearchParams(window.location.search).get('token') ?? '';
    const [password, setPassword] = useState('');
    const [passwordConfirmation, setPasswordConfirmation] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setError(null);
        setSubmitting(true);
        try {
            await api.post('/password/reset', { token, password, password_confirmation: passwordConfirmation });
            setDone(true);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4 dark:bg-ink-950">
            <div className={cx(card, 'w-full max-w-[440px] space-y-5 p-6 sm:p-8')}>
                <BrandMark className="h-11 w-11" />
                <div className="space-y-1.5">
                    <h1 className="font-display text-2xl font-bold text-ink-900 dark:text-white">{t('resetPassword.title')}</h1>
                    <p className="text-sm text-ink-600 dark:text-ink-350">{t('resetPassword.subtitle')}</p>
                </div>

                {!token && <Alert tone="error">{t('resetPassword.missingToken')}</Alert>}

                {done ? (
                    <Alert tone="success" icon={CheckCircle2}>
                        {t('resetPassword.success')}
                    </Alert>
                ) : token ? (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && <Alert tone="error">{error}</Alert>}
                        <div>
                            <label htmlFor="password" className={label}>
                                {t('resetPassword.newPassword')}
                            </label>
                            <div className="relative">
                                <KeyRound aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                                <input
                                    id="password"
                                    type="password"
                                    required
                                    autoComplete="new-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className={cx(input, 'pl-10')}
                                />
                            </div>
                        </div>
                        <div>
                            <label htmlFor="password_confirmation" className={label}>
                                {t('resetPassword.confirmPassword')}
                            </label>
                            <div className="relative">
                                <KeyRound aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                                <input
                                    id="password_confirmation"
                                    type="password"
                                    required
                                    autoComplete="new-password"
                                    value={passwordConfirmation}
                                    onChange={(e) => setPasswordConfirmation(e.target.value)}
                                    className={cx(input, 'pl-10')}
                                />
                            </div>
                        </div>
                        <button type="submit" disabled={submitting} className={button('accent', 'md', 'w-full')}>
                            {submitting ? <Spinner className="h-4 w-4" /> : t('resetPassword.submit')}
                        </button>
                    </form>
                ) : null}

                <Link to="/login" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
                    {t('forgotPassword.backToLogin')}
                </Link>
            </div>
        </div>
    );
}
