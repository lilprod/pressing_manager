import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { ApiError } from '../lib/api';

export default function Login() {
    const { user, login, loading } = useAuth();
    const { t } = useI18n();
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
        <main className="flex min-h-screen items-center justify-center px-4">
            <form
                onSubmit={handleSubmit}
                className="w-full max-w-sm space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800"
                aria-labelledby="login-heading"
            >
                <h1 id="login-heading" className="text-xl font-semibold">
                    {t('app.title')}
                </h1>

                <div>
                    <label htmlFor="email" className="mb-1 block text-sm font-medium">
                        {t('auth.email')}
                    </label>
                    <input
                        id="email"
                        type="email"
                        required
                        autoComplete="username"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base dark:border-slate-600 dark:bg-slate-900"
                    />
                </div>

                <div>
                    <label htmlFor="password" className="mb-1 block text-sm font-medium">
                        {t('auth.password')}
                    </label>
                    <input
                        id="password"
                        type="password"
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base dark:border-slate-600 dark:bg-slate-900"
                    />
                </div>

                {error && (
                    <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
                        {error}
                    </p>
                )}

                <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                    {submitting ? t('auth.loggingIn') : t('auth.login')}
                </button>
            </form>
        </main>
    );
}
