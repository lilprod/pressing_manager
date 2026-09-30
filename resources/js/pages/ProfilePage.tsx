import { useState } from 'react';
import { Building2, Camera, CircleCheck, CircleDashed, KeyRound, Mail, Phone, Save, ShieldCheck, User as UserIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useSettings } from '../contexts/SettingsContext';
import { useTheme } from '../contexts/ThemeContext';
import { api, ApiError } from '../lib/api';
import { useFormat } from '../lib/format';
import PageHeader, { Avatar } from '../components/ui/PageHeader';
import { Alert, Spinner } from '../components/ui/Feedback';
import { ProgressBar, SectionCard } from '../components/ui/Metrics';
import { Pill } from '../components/ui/StatusBadge';
import { button, card, cx, input, label, select } from '../components/ui/styles';
import type { AppSettings, User } from '../types';

/* Écran « Profil et sécurité » (Figma SPARK PRESSING, section 11, node 65:22067) :
 * résumé d'identité, coordonnées, rôle et affectation (lecture seule), préférences
 * d'affichage (langue et thème, déjà gérées côté client), changement de mot de passe
 * avec contrôle de robustesse selon la politique réelle. Omis faute de backend (voir
 * CLAUDE.md §2) : dernière connexion et origine, authentification renforcée (MFA),
 * sessions actives, appareils autorisés, préférences de notification personnelles,
 * multi-agences autorisées. */

function splitName(name: string): [string, string] {
    const [first, ...rest] = name.split(' ');
    return [first ?? '', rest.join(' ')];
}

export default function ProfilePage() {
    const { user, refreshUser } = useAuth();
    const { t } = useI18n();
    const { date } = useFormat();

    const [name, setName] = useState(user?.name ?? '');
    const [phone, setPhone] = useState(user?.phone ?? '');
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    if (!user) return null;

    const [first, last] = splitName(name || user.name);
    const photoPreview = photoFile ? URL.createObjectURL(photoFile) : user.photo_url;
    const dirty = photoFile !== null || name !== user.name || phone !== (user.phone ?? '');

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
            await refreshUser();
            setFeedback(t('settings.saved'));
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={t('profile.title')}
                subtitle={t('profile.subtitle')}
                icon={UserIcon}
                actions={
                    <button type="button" onClick={() => void submit()} disabled={!dirty || busy || name.trim() === ''} className={button('primary', 'md', 'h-10')}>
                        {busy ? <Spinner className="h-4 w-4" /> : <Save aria-hidden="true" className="h-4 w-4" />}
                        {t('profile.save')}
                    </button>
                }
            />

            {error && <Alert tone="error">{error}</Alert>}
            {feedback && <Alert tone="success">{feedback}</Alert>}

            <section aria-label={t('profile.summary')} className={cx(card, 'flex flex-wrap items-center gap-5 p-5 sm:p-6')}>
                <div className="relative shrink-0">
                    <Avatar firstName={first} lastName={last} photoUrl={photoPreview} size="lg" className="h-20 w-20 text-2xl" />
                    <label
                        className="absolute -bottom-1 -right-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-brand-600 text-white shadow ring-2 ring-white transition hover:bg-brand-700 dark:ring-ink-900"
                        title={t('profile.photo')}
                    >
                        <Camera aria-hidden="true" className="h-4 w-4" />
                        <input type="file" accept="image/*" aria-label={t('profile.photo')} onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} className="sr-only" />
                    </label>
                </div>
                <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="font-display text-xl font-bold text-ink-900 dark:text-white">{user.name}</p>
                        <Pill tone="emerald">{t('users.active')}</Pill>
                    </div>
                    <p className="text-sm text-ink-600 dark:text-ink-350">{user.role?.name}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        <Pill tone="neutral" icon={Building2}>
                            {user.agency?.name ?? t('users.allAgencies')}
                        </Pill>
                        {user.role && <Pill tone="brand">{t(`rbac.scope.${user.role.scope}`)}</Pill>}
                    </div>
                </div>
                <div className="basis-full text-sm sm:basis-auto sm:text-right">
                    <p className="text-xs font-medium text-ink-600 dark:text-ink-350">{t('profile.passwordExpiry')}</p>
                    <p className="font-semibold text-ink-900 dark:text-ink-50">
                        {user.password_expires_at ? date(user.password_expires_at) : t('profile.noExpiry')}
                    </p>
                </div>
            </section>

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                <div className="min-w-0 space-y-6">
                    <SectionCard id="profile-identity" title={t('profile.identity')} subtitle={t('profile.identityHint')}>
                        <label className="block">
                            <span className={label}>{t('profile.name')}</span>
                            <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
                        </label>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <label className="block">
                                <span className={label}>{t('profile.email')}</span>
                                <span className="relative block">
                                    <Mail aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                                    <input value={user.email} disabled className={cx(input, 'pl-10')} aria-describedby="email-help" />
                                </span>
                                <span id="email-help" className="mt-1.5 block text-xs text-ink-600 dark:text-ink-350">
                                    {t('profile.emailHelp')}
                                </span>
                            </label>
                            <label className="block">
                                <span className={label}>{t('profile.phone')}</span>
                                <span className="relative block">
                                    <Phone aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                                    <input value={phone} onChange={(e) => setPhone(e.target.value)} className={cx(input, 'pl-10')} />
                                </span>
                            </label>
                        </div>
                    </SectionCard>

                    <SectionCard id="profile-role" title={t('profile.roleTitle')} subtitle={t('profile.roleHint')} headerExtra={<Pill tone="neutral">{t('profile.readOnly')}</Pill>}>
                        <dl className="grid gap-4 sm:grid-cols-3">
                            <div>
                                <dt className="text-xs font-medium text-ink-600 dark:text-ink-350">{t('users.role')}</dt>
                                <dd className="font-semibold text-ink-900 dark:text-ink-50">{user.role?.name ?? '—'}</dd>
                            </div>
                            <div>
                                <dt className="text-xs font-medium text-ink-600 dark:text-ink-350">{t('users.agency')}</dt>
                                <dd className="font-semibold text-ink-900 dark:text-ink-50">{user.agency?.name ?? t('users.allAgencies')}</dd>
                            </div>
                            <div>
                                <dt className="text-xs font-medium text-ink-600 dark:text-ink-350">{t('rbac.permissions')}</dt>
                                <dd className="font-semibold text-ink-900 dark:text-ink-50">{t('rbac.permissionCount', { count: user.role?.permissions?.length ?? 0 })}</dd>
                            </div>
                        </dl>
                    </SectionCard>

                    <Preferences />
                </div>

                <div className="min-w-0 space-y-6">
                    <PasswordForm user={user} />
                </div>
            </div>
        </div>
    );
}

function Preferences() {
    const { t, lang, setLang } = useI18n();
    const { theme, toggleTheme } = useTheme();

    return (
        <SectionCard id="profile-preferences" title={t('profile.preferences')} subtitle={t('profile.preferencesHint')}>
            <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                    <span className={label}>{t('profile.language')}</span>
                    <select value={lang} onChange={(e) => setLang(e.target.value as typeof lang)} className={select}>
                        <option value="fr">Français</option>
                        <option value="en">English</option>
                    </select>
                </label>
                <label className="block">
                    <span className={label}>{t('profile.theme')}</span>
                    <select value={theme} onChange={(e) => e.target.value !== theme && toggleTheme()} className={select}>
                        <option value="light">{t('profile.themeLight')}</option>
                        <option value="dark">{t('profile.themeDark')}</option>
                    </select>
                </label>
            </div>
        </SectionCard>
    );
}

function policyChecks(settings: AppSettings | null, password: string, t: (k: string, p?: Record<string, string | number>) => string) {
    const checks = [{ key: 'length', label: t('profile.passwordMinLengthHint', { length: settings?.password_min_length ?? 8 }), ok: password.length >= (settings?.password_min_length ?? 8) }];
    if (settings?.password_require_uppercase) checks.push({ key: 'upper', label: t('settings.passwordRequireUppercase'), ok: /[A-Z]/.test(password) });
    if (settings?.password_require_number) checks.push({ key: 'number', label: t('settings.passwordRequireNumber'), ok: /\d/.test(password) });
    if (settings?.password_require_symbol) checks.push({ key: 'symbol', label: t('settings.passwordRequireSymbol'), ok: /[^A-Za-z0-9]/.test(password) });
    return checks;
}

function PasswordForm({ user }: { user: User }) {
    const { t } = useI18n();
    const { settings } = useSettings();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const checks = policyChecks(settings, newPassword, t);
    const passed = checks.filter((c) => c.ok).length;
    const mismatch = confirmPassword !== '' && confirmPassword !== newPassword;

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

    const canSubmit = currentPassword !== '' && newPassword !== '' && confirmPassword !== '' && !mismatch;

    return (
        <SectionCard
            id="profile-password"
            title={t('profile.changePassword')}
            subtitle={t('profile.passwordHint')}
            headerExtra={user.password_expired ? <Pill tone="amber">{t('users.passwordExpired')}</Pill> : <Pill tone="emerald" icon={ShieldCheck}>{t('profile.upToDate')}</Pill>}
        >
            {error && <Alert tone="error">{error}</Alert>}
            {feedback && <Alert tone="success">{feedback}</Alert>}

            <label className="block">
                <span className={label}>{t('profile.currentPassword')}</span>
                <span className="relative block">
                    <KeyRound aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                    <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={cx(input, 'pl-10')} autoComplete="current-password" />
                </span>
            </label>
            <label className="block">
                <span className={label}>{t('profile.newPassword')}</span>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={input} autoComplete="new-password" aria-describedby="password-policy" />
            </label>

            <div id="password-policy" className="space-y-2">
                <div className="flex items-center gap-3">
                    <span className="shrink-0 text-xs font-medium text-ink-600 dark:text-ink-350">{t('profile.strength')}</span>
                    <ProgressBar
                        value={newPassword ? passed : 0}
                        max={checks.length}
                        barClassName={passed === checks.length ? 'bg-emerald-600 dark:bg-emerald-400' : 'bg-amber-500 dark:bg-amber-400'}
                    />
                </div>
                <ul className="space-y-1">
                    {checks.map((c) => (
                        <li key={c.key} className={cx('flex items-center gap-2 text-xs', c.ok ? 'text-emerald-800 dark:text-emerald-300' : 'text-ink-600 dark:text-ink-350')}>
                            {c.ok ? <CircleCheck aria-hidden="true" className="h-3.5 w-3.5" /> : <CircleDashed aria-hidden="true" className="h-3.5 w-3.5" />}
                            {c.label}
                        </li>
                    ))}
                </ul>
            </div>

            <label className="block">
                <span className={label}>{t('profile.confirmPassword')}</span>
                <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={cx(input, mismatch && 'border-red-600 focus:border-red-600')}
                    autoComplete="new-password"
                    aria-invalid={mismatch}
                />
                {mismatch && <span className="mt-1.5 block text-xs font-medium text-red-700 dark:text-red-300">{t('profile.mismatch')}</span>}
            </label>

            <button type="button" onClick={() => void submit()} disabled={!canSubmit || busy} className={button('primary', 'md', 'w-full')}>
                {busy ? <Spinner className="h-4 w-4" /> : <KeyRound aria-hidden="true" className="h-4 w-4" />}
                {t('profile.changePassword')}
            </button>
        </SectionCard>
    );
}
