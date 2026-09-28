import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useSettings } from '../contexts/SettingsContext';
import { api, ApiError } from '../lib/api';
import PageHeader, { Avatar } from '../components/ui/PageHeader';
import { Alert, Spinner } from '../components/ui/Feedback';
import { button, cardPadded, cx, input, label, sectionTitle } from '../components/ui/styles';
import { KeyRound, User as UserIcon } from 'lucide-react';
import type { User } from '../types';

export default function ProfilePage() {
    const { user, refreshUser } = useAuth();
    const { t } = useI18n();

    if (!user) return null;

    const [firstName] = (user.name ?? '').split(' ');
    const lastName = user.name.split(' ').slice(1).join(' ');

    return (
        <div className="space-y-6">
            <PageHeader title={t('profile.title')} subtitle={t('profile.subtitle')} icon={UserIcon} />

            <div className="grid max-w-3xl gap-6">
                <ProfileForm user={user} firstName={firstName} lastName={lastName} onSaved={refreshUser} />
                <PasswordForm />
            </div>
        </div>
    );
}

function ProfileForm({ user, firstName, lastName, onSaved }: { user: User; firstName: string; lastName: string; onSaved: () => Promise<void> }) {
    const { t } = useI18n();
    const [name, setName] = useState(user.name);
    const [phone, setPhone] = useState(user.phone ?? '');
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const photoPreview = photoFile ? URL.createObjectURL(photoFile) : user.photo_url;

    async function submit() {
        setBusy(true);
        setError(null);
        setFeedback(null);
        try {
            const formData = new FormData();
            formData.append('name', name);
            formData.append('phone', phone);
            if (photoFile) formData.append('photo', photoFile);
            await api.postForm('/profile', formData);
            setPhotoFile(null);
            await onSaved();
            setFeedback(t('settings.saved'));
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className={cx(cardPadded, 'space-y-5')}>
            <h2 className={sectionTitle}>{t('profile.identity')}</h2>
            {error && <Alert tone="error">{error}</Alert>}
            {feedback && <Alert tone="success">{feedback}</Alert>}

            <div className="flex items-center gap-4">
                <Avatar firstName={firstName} lastName={lastName} photoUrl={photoPreview} size="lg" />
                <label className="block">
                    <span className={label}>{t('profile.photo')}</span>
                    <input
                        type="file"
                        accept="image/*"
                        aria-label={t('profile.photo')}
                        onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                        className="mt-1 block text-sm text-ink-700 file:mr-3 file:rounded-lg file:border-0 file:bg-ink-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-ink-800 hover:file:bg-ink-200 dark:text-ink-200 dark:file:bg-ink-800 dark:file:text-ink-100 dark:hover:file:bg-ink-700"
                    />
                </label>
            </div>

            <label className="block">
                <span className={label}>{t('profile.name')}</span>
                <input value={name} onChange={(e) => setName(e.target.value)} className={cx(input, 'w-full')} />
            </label>
            <label className="block">
                <span className={label}>{t('profile.phone')}</span>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} className={cx(input, 'w-full')} />
            </label>
            <label className="block">
                <span className={label}>{t('profile.email')}</span>
                <input value={user.email} disabled className={cx(input, 'w-full cursor-not-allowed opacity-60')} />
            </label>

            <div className="flex justify-end">
                <button type="button" onClick={() => void submit()} disabled={busy} className={button('primary', 'md')}>
                    {busy ? <Spinner className="h-4 w-4" /> : null}
                    {t('common.save')}
                </button>
            </div>
        </section>
    );
}

function PasswordForm() {
    const { t } = useI18n();
    const { settings } = useSettings();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function submit() {
        setBusy(true);
        setError(null);
        setFeedback(null);
        try {
            await api.post('/profile/password', {
                current_password: currentPassword,
                new_password: newPassword,
                new_password_confirmation: confirmPassword,
            });
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setFeedback(t('profile.passwordChanged'));
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    const canSubmit = currentPassword !== '' && newPassword !== '' && confirmPassword !== '';

    return (
        <section className={cx(cardPadded, 'space-y-5')}>
            <h2 className={cx(sectionTitle, 'flex items-center gap-2')}>
                <KeyRound aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                {t('profile.password')}
            </h2>
            {error && <Alert tone="error">{error}</Alert>}
            {feedback && <Alert tone="success">{feedback}</Alert>}

            {settings && (
                <p className="text-xs text-ink-600 dark:text-ink-350">
                    {t('profile.passwordMinLengthHint', { length: settings.password_min_length })}
                    {(settings.password_require_uppercase || settings.password_require_number || settings.password_require_symbol) && (
                        <>
                            {' '}
                            {t('profile.passwordRequirementsHint', {
                                requirements: [
                                    settings.password_require_uppercase ? t('settings.passwordRequireUppercase').toLowerCase() : null,
                                    settings.password_require_number ? t('settings.passwordRequireNumber').toLowerCase() : null,
                                    settings.password_require_symbol ? t('settings.passwordRequireSymbol').toLowerCase() : null,
                                ]
                                    .filter(Boolean)
                                    .join(', '),
                            })}
                        </>
                    )}
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

            <div className="flex justify-end">
                <button type="button" onClick={() => void submit()} disabled={!canSubmit || busy} className={button('primary', 'md')}>
                    {busy ? <Spinner className="h-4 w-4" /> : null}
                    {t('profile.changePassword')}
                </button>
            </div>
        </section>
    );
}
