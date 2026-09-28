import { useState } from 'react';
import { KeyRound, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useSettings } from '../contexts/SettingsContext';
import { api, ApiError } from '../lib/api';
import BrandMark from './BrandMark';
import { Alert, Spinner } from './ui/Feedback';
import { button, card, cx, input, label } from './ui/styles';

export default function ForcedPasswordChangeScreen({ expired }: { expired: boolean }) {
    const { logout, refreshUser } = useAuth();
    const { t } = useI18n();
    const { settings } = useSettings();

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function submit() {
        setBusy(true);
        setError(null);
        try {
            await api.post('/profile/password', {
                current_password: currentPassword,
                new_password: newPassword,
                new_password_confirmation: confirmPassword,
            });
            await refreshUser();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    const canSubmit = currentPassword !== '' && newPassword !== '' && confirmPassword !== '';

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-50 px-4 py-10 dark:bg-ink-950">
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-amber-100/70 to-transparent dark:from-amber-500/10"
            />

            <div className="relative w-full max-w-md space-y-6">
                <div className="flex justify-center">
                    <BrandMark />
                </div>

                <div className={cx(card, 'overflow-hidden')}>
                    <div className="flex flex-col items-center gap-3 border-b border-ink-200/80 bg-amber-50/60 px-6 pb-6 pt-8 text-center dark:border-ink-800 dark:bg-amber-400/5">
                        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-700 text-white shadow-lg shadow-amber-700/25 dark:bg-amber-400 dark:text-ink-950 dark:shadow-none">
                            <KeyRound aria-hidden="true" className="h-7 w-7" />
                        </span>
                        <h1 className="font-display text-xl font-bold text-amber-800 dark:text-amber-300">
                            {expired ? t('profile.expiredTitle') : t('profile.mustChangeTitle')}
                        </h1>
                        <p role="alert" className="text-sm text-ink-700 dark:text-ink-300">
                            {expired ? t('profile.expiredMessage') : t('profile.mustChangeMessage')}
                        </p>
                    </div>

                    <div className="space-y-4 p-6">
                        {error && <Alert tone="error">{error}</Alert>}

                        {settings && (
                            <p className="text-xs text-ink-600 dark:text-ink-350">
                                {t('profile.passwordMinLengthHint', { length: settings.password_min_length })}
                            </p>
                        )}

                        <label className="block">
                            <span className={label}>{t('profile.currentPassword')}</span>
                            <input
                                type="password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className={cx(input, 'w-full')}
                                autoComplete="current-password"
                            />
                        </label>
                        <label className="block">
                            <span className={label}>{t('profile.newPassword')}</span>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className={cx(input, 'w-full')}
                                autoComplete="new-password"
                            />
                        </label>
                        <label className="block">
                            <span className={label}>{t('profile.confirmPassword')}</span>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className={cx(input, 'w-full')}
                                autoComplete="new-password"
                            />
                        </label>

                        <button type="button" onClick={() => void submit()} disabled={!canSubmit || busy} className={button('primary', 'lg', 'w-full')}>
                            {busy ? <Spinner className="h-4 w-4" /> : null}
                            {t('profile.changePassword')}
                        </button>

                        <button type="button" onClick={() => void logout()} className={button('ghost', 'md', 'w-full')}>
                            <LogOut aria-hidden="true" className="h-4 w-4" />
                            {t('nav.logout')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
