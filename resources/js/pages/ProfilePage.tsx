import { useCallback, useEffect, useState } from 'react';
import { Building2, Camera, CircleCheck, CircleDashed, KeyRound, LogOut, Mail, Monitor, Phone, Save, ShieldCheck, Smartphone, Tablet, User as UserIcon, Volume2 } from 'lucide-react';
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
import { button, cx, input, label, select } from '../components/ui/styles';
import type { AppSettings, User } from '../types';

/* Écran « Profil et sécurité staff » (capture Figma « Profil-sécurité-staff », audit
 * du 2026-10-13). Toutes les données viennent de /me et /profile/security : dernière
 * connexion (journal auth_events), sessions actives (jetons Sanctum + IP/appareil),
 * appareils de confiance, authentification renforcée (TOTP), affectations
 * multi-agences (lecture seule, gérées par l'administrateur). Omis : notifications
 * WhatsApp (aucune passerelle WhatsApp n'existe). */

interface SecurityOverview {
    last_login: { at: string; ip_address: string | null; device: string | null } | null;
    password_changed_at: string | null;
    mfa: { enabled: boolean; enabled_at: string | null; required: boolean; recovery_codes_remaining: number };
    sessions: { id: number; device: string; kind: 'phone' | 'tablet' | 'desktop'; ip_address: string | null; last_used_at: string | null; created_at: string; current: boolean }[];
    devices: { id: number; label: string; kind: 'phone' | 'tablet' | 'desktop'; authorized_until: string; last_used_at: string | null }[];
}

const TIMEZONES = ['Africa/Lome', 'Africa/Abidjan', 'Africa/Douala', 'Africa/Dakar', 'Africa/Lagos', 'Africa/Cotonou', 'Europe/Paris', 'UTC'];

function splitName(name: string): [string, string] {
    const [first, ...rest] = name.split(' ');
    return [first ?? '', rest.join(' ')];
}

function DeviceIcon({ kind }: { kind: 'phone' | 'tablet' | 'desktop' }) {
    const Icon = kind === 'phone' ? Smartphone : kind === 'tablet' ? Tablet : Monitor;
    return (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300">
            <Icon aria-hidden="true" className="h-4 w-4" />
        </span>
    );
}

export default function ProfilePage() {
    const { user, refreshUser } = useAuth();
    const { t } = useI18n();
    const { date, dateTime } = useFormat();

    const [initialFirst, initialLast] = splitName(user?.name ?? '');
    const [firstName, setFirstName] = useState(user?.first_name ?? initialFirst);
    const [lastName, setLastName] = useState(user?.last_name ?? initialLast);
    const [phone, setPhone] = useState(user?.phone ?? '');
    const [jobTitle, setJobTitle] = useState(user?.job_title ?? '');
    const [timezone, setTimezone] = useState(user?.timezone ?? '');
    const [prefs, setPrefs] = useState<Prefs>({ daily_summary: false, sound_alerts: false, ...(user?.preferences ?? {}) });
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [security, setSecurity] = useState<SecurityOverview | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const loadSecurity = useCallback(() => {
        api.get<SecurityOverview>('/profile/security').then(setSecurity).catch(() => setSecurity(null));
    }, []);
    useEffect(loadSecurity, [loadSecurity]);

    if (!user) return null;

    const photoPreview = photoFile ? URL.createObjectURL(photoFile) : user.photo_url;

    async function submit() {
        setBusy(true);
        setError(null);
        setFeedback(null);
        try {
            const formData = new FormData();
            formData.append('first_name', firstName);
            formData.append('last_name', lastName);
            formData.append('phone', phone);
            formData.append('job_title', jobTitle);
            if (timezone) formData.append('timezone', timezone);
            formData.append('preferences[daily_summary]', prefs.daily_summary ? '1' : '0');
            formData.append('preferences[sound_alerts]', prefs.sound_alerts ? '1' : '0');
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

    const agencies = [user.agency, ...(user.extra_agencies ?? [])].filter(Boolean) as { id: number; name: string }[];

    return (
        <div className="space-y-6">
            <PageHeader
                title={t('profile.title')}
                subtitle={t('profile.subtitle')}
                icon={UserIcon}
                actions={
                    <button type="button" onClick={() => void submit()} disabled={busy || `${firstName}${lastName}`.trim() === ''} className={button('primary', 'md', 'h-10')}>
                        {busy ? <Spinner className="h-4 w-4" /> : <Save aria-hidden="true" className="h-4 w-4" />}
                        {t('profile.save')}
                    </button>
                }
            />

            {error && <Alert tone="error">{error}</Alert>}
            {feedback && <Alert tone="success">{feedback}</Alert>}

            <section aria-label={t('profile.summary')} className="flex flex-wrap items-center gap-5 rounded-2xl bg-brand-950 p-5 text-white sm:p-6">
                <div className="relative shrink-0">
                    <Avatar firstName={firstName} lastName={lastName} photoUrl={photoPreview} size="lg" className="h-20 w-20 text-2xl" />
                    <label
                        className="absolute -bottom-1 -right-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-accent-500 text-ink-950 shadow ring-2 ring-brand-950 transition hover:bg-accent-400"
                        title={t('profile.photo')}
                    >
                        <Camera aria-hidden="true" className="h-4 w-4" />
                        <input type="file" accept="image/*" aria-label={t('profile.photo')} onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} className="sr-only" />
                    </label>
                </div>
                <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="font-display text-xl font-bold">{user.name}</p>
                        <span className="rounded-full bg-emerald-400/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-200">{t('profile.activeAccount')}</span>
                    </div>
                    <p className="text-sm text-brand-100/80">
                        {[user.job_title || user.role?.name, user.employee_number ? t('profile.employeeNumber', { number: user.employee_number }) : null].filter(Boolean).join(' · ')}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {agencies.length === 0 ? (
                            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold">{t('users.allAgencies')}</span>
                        ) : (
                            agencies.map((agency, index) => (
                                <span key={agency.id} className={cx('rounded-full px-2.5 py-0.5 text-xs font-semibold', index === 0 ? 'bg-accent-400 text-ink-950' : 'bg-white/10')}>
                                    {index === 0 ? t('profile.mainAgency', { name: agency.name }) : agency.name}
                                </span>
                            ))
                        )}
                    </div>
                </div>
                <div className="basis-full text-sm sm:basis-auto sm:text-right">
                    <p className="text-xs text-brand-100/70">{t('profile.lastLogin')}</p>
                    <p className="font-semibold">{security?.last_login ? dateTime(security.last_login.at) : '—'}</p>
                    {security?.last_login && <p className="text-xs text-brand-100/70">{[security.last_login.device, security.last_login.ip_address].filter(Boolean).join(' · ')}</p>}
                </div>
            </section>

            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                <div className="min-w-0 space-y-6">
                    <SectionCard id="profile-identity" title={t('profile.identity')} subtitle={t('profile.identityHint')}>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <label className="block">
                                <span className={label}>{t('client.firstName')} *</span>
                                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={input} />
                            </label>
                            <label className="block">
                                <span className={label}>{t('client.lastName')} *</span>
                                <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={input} />
                            </label>
                        </div>
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
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <label className="block">
                                <span className={label}>{t('profile.phone')}</span>
                                <span className="relative block">
                                    <Phone aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                                    <input value={phone} onChange={(e) => setPhone(e.target.value)} className={cx(input, 'pl-10')} />
                                </span>
                            </label>
                            <label className="block">
                                <span className={label}>{t('profile.jobTitle')}</span>
                                <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className={input} />
                            </label>
                        </div>
                    </SectionCard>

                    <SectionCard id="profile-role" title={t('profile.roleTitle')} subtitle={t('profile.roleHint')} headerExtra={<Pill tone="amber">{t('profile.managedByAdmin')}</Pill>}>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <label className="block">
                                <span className={label}>{t('users.role')}</span>
                                <input value={user.role?.name ?? '—'} disabled className={input} />
                            </label>
                            <label className="block">
                                <span className={label}>{t('profile.mainAgencyLabel')}</span>
                                <input value={user.agency?.name ?? t('users.allAgencies')} disabled className={input} />
                            </label>
                        </div>
                        <div>
                            <p className={label}>{t('profile.extraAgencies')}</p>
                            {(user.extra_agencies ?? []).length === 0 ? (
                                <p className="text-sm text-ink-600 dark:text-ink-350">{user.agency_id === null ? t('profile.globalScope') : t('profile.noExtraAgencies')}</p>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {user.extra_agencies!.map((agency) => (
                                        <Pill key={agency.id} tone="brand" icon={Building2}>
                                            {agency.name}
                                        </Pill>
                                    ))}
                                </div>
                            )}
                        </div>
                    </SectionCard>

                    <PreferencesCard timezone={timezone} setTimezone={setTimezone} prefs={prefs} setPrefs={setPrefs} />
                </div>

                <div className="min-w-0 space-y-6">
                    <PasswordForm user={user} lastChangedAt={security?.password_changed_at ?? null} onChanged={loadSecurity} />
                    {security && <MfaCard mfa={security.mfa} onChange={loadSecurity} />}
                    {security && (
                        <SectionCard
                            id="profile-sessions"
                            title={t('profile.sessions.title')}
                            subtitle={t('profile.sessions.subtitle', { count: security.sessions.length })}
                            headerExtra={
                                security.sessions.length > 1 ? (
                                    <button
                                        type="button"
                                        onClick={() => void api.delete('/profile/sessions').then(loadSecurity)}
                                        className={button('dangerGhost', 'sm')}
                                    >
                                        <LogOut aria-hidden="true" className="h-4 w-4" />
                                        {t('profile.sessions.revokeOthers')}
                                    </button>
                                ) : undefined
                            }
                        >
                            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                                {security.sessions.map((session) => (
                                    <li key={session.id} className="flex items-center gap-3 py-3">
                                        <DeviceIcon kind={session.kind} />
                                        <div className="min-w-0 flex-1">
                                            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-900 dark:text-ink-50">
                                                {session.device}
                                                {session.current && <Pill tone="emerald">{t('profile.sessions.current')}</Pill>}
                                            </p>
                                            <p className="text-xs text-ink-600 dark:text-ink-350">
                                                {[session.ip_address, session.last_used_at ? dateTime(session.last_used_at) : dateTime(session.created_at)].filter(Boolean).join(' · ')}
                                            </p>
                                        </div>
                                        {!session.current && (
                                            <button type="button" onClick={() => void api.delete(`/profile/sessions/${session.id}`).then(loadSecurity)} className="text-sm font-semibold text-red-700 hover:underline dark:text-red-300">
                                                {t('profile.sessions.revoke')}
                                            </button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </SectionCard>
                    )}
                    {security && (
                        <SectionCard id="profile-devices" title={t('profile.devices.title')} subtitle={t('profile.devices.subtitle')}>
                            {security.devices.length === 0 ? (
                                <p className="text-sm text-ink-600 dark:text-ink-350">{security.mfa.enabled ? t('profile.devices.empty') : t('profile.devices.needsMfa')}</p>
                            ) : (
                                <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                                    {security.devices.map((device) => (
                                        <li key={device.id} className="flex items-center gap-3 py-3">
                                            <DeviceIcon kind={device.kind} />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">{device.label}</p>
                                                <p className="text-xs text-ink-600 dark:text-ink-350">{t('profile.devices.until', { date: date(device.authorized_until) })}</p>
                                            </div>
                                            <button type="button" onClick={() => void api.delete(`/profile/devices/${device.id}`).then(loadSecurity)} className="text-sm font-semibold text-red-700 hover:underline dark:text-red-300">
                                                {t('profile.devices.revoke')}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </SectionCard>
                    )}
                </div>
            </div>
        </div>
    );
}

type Prefs = { daily_summary?: boolean; sound_alerts?: boolean };

function PreferencesCard({ timezone, setTimezone, prefs, setPrefs }: { timezone: string; setTimezone: (v: string) => void; prefs: Prefs; setPrefs: (p: Prefs) => void }) {
    const { t, lang, setLang } = useI18n();
    const { theme, toggleTheme } = useTheme();

    return (
        <SectionCard id="profile-preferences" title={t('profile.preferences')} subtitle={t('profile.preferencesHint')}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <label className="block">
                <span className={label}>{t('profile.timezone')}</span>
                <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={select}>
                    <option value="">{t('profile.timezoneDevice')}</option>
                    {TIMEZONES.map((tz) => (
                        <option key={tz} value={tz}>
                            {tz}
                        </option>
                    ))}
                </select>
            </label>
            <PrefToggle icon={Mail} title={t('profile.prefs.dailySummary')} hint={t('profile.prefs.dailySummaryHint')} checked={!!prefs.daily_summary} onChange={(v) => setPrefs({ ...prefs, daily_summary: v })} />
            <PrefToggle icon={Volume2} title={t('profile.prefs.soundAlerts')} hint={t('profile.prefs.soundAlertsHint')} checked={!!prefs.sound_alerts} onChange={(v) => setPrefs({ ...prefs, sound_alerts: v })} />
        </SectionCard>
    );
}

function PrefToggle({ icon: Icon, title, hint, checked, onChange }: { icon: typeof Mail; title: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <label className="flex cursor-pointer items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                <Icon aria-hidden="true" className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink-900 dark:text-ink-50">{title}</span>
                <span className="block text-xs text-ink-600 dark:text-ink-350">{hint}</span>
            </span>
            <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-5 w-9 shrink-0 cursor-pointer accent-brand-600" />
        </label>
    );
}

function MfaCard({ mfa, onChange }: { mfa: SecurityOverview['mfa']; onChange: () => void }) {
    const { t } = useI18n();
    const { date } = useFormat();
    const [setup, setSetup] = useState<{ secret: string; qr_code_data_uri: string } | null>(null);
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [disabling, setDisabling] = useState(false);
    const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function run(action: () => Promise<void>) {
        setError(null);
        try {
            await action();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        }
    }

    return (
        <SectionCard
            id="profile-mfa"
            title={t('profile.mfa.title')}
            subtitle={t('profile.mfa.subtitle')}
            headerExtra={mfa.enabled ? <Pill tone="emerald">{t('profile.mfa.enabled')}</Pill> : <Pill tone={mfa.required ? 'amber' : 'neutral'}>{mfa.required ? t('profile.mfa.requiredBadge') : t('profile.mfa.disabled')}</Pill>}
        >
            {error && <Alert tone="error">{error}</Alert>}
            {recoveryCodes && (
                <Alert tone="warning">
                    <p className="font-semibold">{t('profile.mfa.recoveryTitle')}</p>
                    <p className="mt-1 font-mono text-xs tracking-wide">{recoveryCodes.join('  ')}</p>
                </Alert>
            )}
            {mfa.enabled ? (
                <>
                    <div className="flex items-center gap-3 text-sm">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
                            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
                        </span>
                        <div>
                            <p className="font-semibold text-ink-900 dark:text-ink-50">{t('profile.mfa.app')}</p>
                            <p className="text-xs text-ink-600 dark:text-ink-350">
                                {t('profile.mfa.configured', { date: mfa.enabled_at ? date(mfa.enabled_at) : '—', count: mfa.recovery_codes_remaining })}
                            </p>
                        </div>
                    </div>
                    {!mfa.required &&
                        (disabling ? (
                            <div className="space-y-2">
                                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('profile.currentPassword')} className={input} />
                                <button
                                    type="button"
                                    onClick={() => void run(async () => { await api.delete('/profile/mfa', { password }); setDisabling(false); setPassword(''); onChange(); })}
                                    className={button('danger', 'sm')}
                                >
                                    {t('profile.mfa.confirmDisable')}
                                </button>
                            </div>
                        ) : (
                            <button type="button" onClick={() => setDisabling(true)} className={button('secondary', 'sm', 'self-start')}>
                                {t('profile.mfa.disable')}
                            </button>
                        ))}
                </>
            ) : setup ? (
                <div className="space-y-3">
                    <p className="text-sm text-ink-700 dark:text-ink-200">{t('profile.mfa.scan')}</p>
                    <img src={setup.qr_code_data_uri} alt={t('profile.mfa.qrAlt')} className="h-40 w-40 rounded-lg border border-ink-200 bg-white p-2" />
                    <p className="break-all font-mono text-xs text-ink-600 dark:text-ink-350">{setup.secret}</p>
                    <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" inputMode="numeric" maxLength={10} className={input} />
                    <button
                        type="button"
                        onClick={() => void run(async () => {
                            const res = await api.post<{ recovery_codes: string[] }>('/profile/mfa/confirm', { code });
                            setRecoveryCodes(res.recovery_codes);
                            setSetup(null);
                            setCode('');
                            onChange();
                        })}
                        className={button('primary', 'sm')}
                    >
                        {t('profile.mfa.confirm')}
                    </button>
                </div>
            ) : (
                <button type="button" onClick={() => void run(async () => setSetup(await api.post('/profile/mfa/setup')))} className={button('primary', 'sm', 'self-start')}>
                    <ShieldCheck aria-hidden="true" className="h-4 w-4" />
                    {t('profile.mfa.enable')}
                </button>
            )}
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

function PasswordForm({ user, lastChangedAt, onChanged }: { user: User; lastChangedAt: string | null; onChanged: () => void }) {
    const { date } = useFormat();
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
            onChanged();
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
            subtitle={lastChangedAt ? t('profile.passwordLastChanged', { date: date(lastChangedAt) }) : t('profile.passwordHint')}
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
