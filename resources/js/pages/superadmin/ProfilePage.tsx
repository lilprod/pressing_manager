import { useRef, useState, type FormEvent } from 'react';
import { Camera, KeyRound, Mail, Phone, UserRound } from 'lucide-react';
import { useSuperadminAuth } from '../../contexts/SuperadminAuthContext';
import { getPlatformToken, platformApi, PlatformApiError } from '../../lib/platformApi';
import { Avatar } from '../../components/ui/PageHeader';
import { Alert, Spinner } from '../../components/ui/Feedback';
import { SectionCard } from '../../components/ui/Metrics';
import { button, cx, input, label } from '../../components/ui/styles';

/**
 * Phase 0 (continuité de compte) + Phase 1 : profil minimal (nom, téléphone, photo)
 * + changement de mot de passe self-service — mirrors pages/ProfilePage.tsx tenant.
 * Avant cette page, un platform_user n'avait AUCUN moyen de changer son mot de
 * passe après sa création (voir CLAUDE.md « Licence / facturation — gap
 * d'harmonisation »). Pas d'i18n sur cette console (décision Phase 1 inchangée).
 */
export default function ProfilePage() {
    const { user, refresh } = useSuperadminAuth();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [name, setName] = useState(user?.name ?? '');
    const [phone, setPhone] = useState(user?.phone ?? '');
    const [savingProfile, setSavingProfile] = useState(false);
    const [profileError, setProfileError] = useState<string | null>(null);
    const [profileSuccess, setProfileSuccess] = useState(false);

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newPasswordConfirmation, setNewPasswordConfirmation] = useState('');
    const [passwordBusy, setPasswordBusy] = useState(false);
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [passwordSuccess, setPasswordSuccess] = useState(false);

    const [mfaStep, setMfaStep] = useState<'idle' | 'setup' | 'disable'>('idle');
    const [mfaQrDataUri, setMfaQrDataUri] = useState<string | null>(null);
    const [mfaPassword, setMfaPassword] = useState('');
    const [mfaCode, setMfaCode] = useState('');
    const [mfaBusy, setMfaBusy] = useState(false);
    const [mfaError, setMfaError] = useState<string | null>(null);
    const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

    if (!user) return null;

    async function saveProfile(event: FormEvent) {
        event.preventDefault();
        setSavingProfile(true);
        setProfileError(null);
        setProfileSuccess(false);
        try {
            await platformApi.patch('/me', { name, phone: phone || null });
            await refresh();
            setProfileSuccess(true);
        } catch (err) {
            setProfileError(err instanceof PlatformApiError ? err.message : 'Une erreur est survenue.');
        } finally {
            setSavingProfile(false);
        }
    }

    async function uploadPhoto(file: File) {
        const formData = new FormData();
        formData.append('photo', file);
        formData.append('_method', 'PATCH');
        try {
            await fetch('/api/platform/me', {
                method: 'POST',
                headers: { Authorization: `Bearer ${getPlatformToken() ?? ''}` },
                body: formData,
            });
            await refresh();
        } catch {
            setProfileError('Le téléversement de la photo a échoué.');
        }
    }

    async function changePassword(event: FormEvent) {
        event.preventDefault();
        setPasswordBusy(true);
        setPasswordError(null);
        setPasswordSuccess(false);
        try {
            await platformApi.patch('/me/password', {
                current_password: currentPassword,
                new_password: newPassword,
                new_password_confirmation: newPasswordConfirmation,
            });
            setCurrentPassword('');
            setNewPassword('');
            setNewPasswordConfirmation('');
            setPasswordSuccess(true);
        } catch (err) {
            setPasswordError(err instanceof PlatformApiError ? err.message : 'Une erreur est survenue.');
        } finally {
            setPasswordBusy(false);
        }
    }

    function resetMfaForm() {
        setMfaStep('idle');
        setMfaQrDataUri(null);
        setMfaPassword('');
        setMfaCode('');
        setMfaError(null);
    }

    async function startMfaSetup() {
        setMfaBusy(true);
        setMfaError(null);
        try {
            const result = await platformApi.post<{ otpauth_uri: string; qr_code_data_uri: string }>('/me/mfa/setup');
            setMfaQrDataUri(result.qr_code_data_uri);
            setMfaCode('');
            setMfaStep('setup');
        } catch (err) {
            setMfaError(err instanceof PlatformApiError ? err.message : 'Une erreur est survenue.');
        } finally {
            setMfaBusy(false);
        }
    }

    async function enableMfa(event: FormEvent) {
        event.preventDefault();
        setMfaBusy(true);
        setMfaError(null);
        try {
            const result = await platformApi.post<{ recovery_codes: string[] }>('/me/mfa/enable', { code: mfaCode });
            setRecoveryCodes(result.recovery_codes);
            resetMfaForm();
            await refresh();
        } catch (err) {
            setMfaError(err instanceof PlatformApiError ? err.message : 'Une erreur est survenue.');
        } finally {
            setMfaBusy(false);
        }
    }

    async function disableMfa(event: FormEvent) {
        event.preventDefault();
        setMfaBusy(true);
        setMfaError(null);
        try {
            await platformApi.post('/me/mfa/disable', { password: mfaPassword, code: mfaCode });
            resetMfaForm();
            await refresh();
        } catch (err) {
            setMfaError(err instanceof PlatformApiError ? err.message : 'Une erreur est survenue.');
        } finally {
            setMfaBusy(false);
        }
    }

    const mfaEnabled = user.totp_enabled_at !== null;
    const [first, ...rest] = (user.name || '?').split(' ');

    return (
        <div className="max-w-2xl space-y-6">
            <header className="flex items-center gap-3.5">
                <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-400 to-accent-600 text-ink-950 shadow-sm sm:flex">
                    <UserRound aria-hidden="true" className="h-5 w-5" strokeWidth={2} />
                </span>
                <div>
                    <h1 className="font-display text-2xl font-bold text-ink-900 dark:text-white">Profil</h1>
                    <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-350">Vos informations et votre sécurité sur la console plateforme.</p>
                </div>
            </header>

            {user.must_change_password && (
                <Alert tone="error">Votre mot de passe a été réinitialisé — vous devez le changer avant de continuer.</Alert>
            )}

            <SectionCard id="profile-identity" title="Identité">
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <Avatar firstName={first} lastName={rest.join(' ')} size="lg" />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            aria-label="Changer la photo"
                            className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white shadow ring-2 ring-white dark:ring-ink-900"
                        >
                            <Camera aria-hidden="true" className="h-3.5 w-3.5" />
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) void uploadPhoto(file);
                            }}
                        />
                    </div>
                    <div>
                        <p className="font-semibold text-ink-900 dark:text-ink-50">{user.name}</p>
                        <p className="text-sm text-ink-600 dark:text-ink-350">{user.platform_role?.name ?? '—'}</p>
                    </div>
                </div>

                <form onSubmit={saveProfile} className="mt-5 space-y-4">
                    {profileError && <Alert tone="error">{profileError}</Alert>}
                    {profileSuccess && <Alert tone="success">Profil mis à jour.</Alert>}

                    <label className="block">
                        <span className={label}>Nom</span>
                        <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
                    </label>
                    <label className="block">
                        <span className={label}>E-mail</span>
                        <span className="relative block">
                            <Mail aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                            <input value={user.email} disabled className={cx(input, 'pl-10 opacity-60')} />
                        </span>
                    </label>
                    <label className="block">
                        <span className={label}>Téléphone</span>
                        <span className="relative block">
                            <Phone aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={cx(input, 'pl-10')} />
                        </span>
                    </label>

                    <button type="submit" disabled={savingProfile} className={button('primary', 'md')}>
                        {savingProfile ? <Spinner className="h-4 w-4" /> : null}
                        Enregistrer
                    </button>
                </form>
            </SectionCard>

            <SectionCard id="profile-password" title="Mot de passe" subtitle="Au moins 12 caractères, majuscule et chiffre.">
                <form onSubmit={changePassword} className="space-y-4">
                    {passwordError && <Alert tone="error">{passwordError}</Alert>}
                    {passwordSuccess && <Alert tone="success">Mot de passe changé avec succès.</Alert>}

                    <label className="block">
                        <span className={label}>Mot de passe actuel</span>
                        <span className="relative block">
                            <KeyRound aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                            <input
                                type="password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className={cx(input, 'pl-10')}
                            />
                        </span>
                    </label>
                    <label className="block">
                        <span className={label}>Nouveau mot de passe</span>
                        <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={input} />
                    </label>
                    <label className="block">
                        <span className={label}>Confirmer le nouveau mot de passe</span>
                        <input
                            type="password"
                            value={newPasswordConfirmation}
                            onChange={(e) => setNewPasswordConfirmation(e.target.value)}
                            className={input}
                        />
                    </label>

                    <button
                        type="submit"
                        disabled={passwordBusy || !currentPassword || !newPassword || newPassword !== newPasswordConfirmation}
                        className={button('primary', 'md')}
                    >
                        {passwordBusy ? <Spinner className="h-4 w-4" /> : null}
                        Changer le mot de passe
                    </button>
                </form>
            </SectionCard>

            <SectionCard
                id="profile-mfa"
                title="Double authentification"
                subtitle="Code à 6 chiffres généré par votre application d'authentification."
            >
                {mfaError && <Alert tone="error">{mfaError}</Alert>}

                {recoveryCodes ? (
                    <div className="space-y-4">
                        <Alert tone="success">
                            Double authentification activée. Conservez ces codes de secours : ils ne seront plus affichés.
                        </Alert>
                        <ul className="grid grid-cols-2 gap-2 font-mono text-sm text-ink-900 dark:text-ink-50">
                            {recoveryCodes.map((code) => (
                                <li key={code} className="rounded-lg bg-ink-100 px-3 py-2 dark:bg-ink-800">
                                    {code}
                                </li>
                            ))}
                        </ul>
                        <button type="button" onClick={() => setRecoveryCodes(null)} className={button('primary', 'md')}>
                            J'ai noté mes codes
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <p className="text-sm text-ink-700 dark:text-ink-200">
                            Statut :{' '}
                            <span className="font-semibold text-ink-900 dark:text-white">{mfaEnabled ? 'activée' : 'désactivée'}</span>
                        </p>

                        {mfaStep === 'idle' &&
                            (mfaEnabled ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMfaError(null);
                                        setMfaStep('disable');
                                    }}
                                    className={button('danger', 'md')}
                                >
                                    Désactiver la double authentification
                                </button>
                            ) : (
                                <button type="button" onClick={() => void startMfaSetup()} disabled={mfaBusy} className={button('primary', 'md')}>
                                    {mfaBusy ? <Spinner className="h-4 w-4" /> : null}
                                    Activer la double authentification
                                </button>
                            ))}

                        {mfaStep === 'setup' && mfaQrDataUri && (
                            <form onSubmit={enableMfa} className="space-y-4">
                                <img
                                    src={mfaQrDataUri}
                                    alt="QR code de la double authentification"
                                    className="h-44 w-44 rounded-lg bg-white p-2"
                                />
                                <p className="text-sm text-ink-600 dark:text-ink-350">
                                    Scannez ce QR code avec votre application d'authentification, puis saisissez le code affiché.
                                </p>
                                <label className="block">
                                    <span className={label}>Code à 6 chiffres</span>
                                    <input
                                        inputMode="numeric"
                                        autoComplete="one-time-code"
                                        maxLength={6}
                                        value={mfaCode}
                                        onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                                        className={input}
                                    />
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    <button type="submit" disabled={mfaBusy || mfaCode.length !== 6} className={button('primary', 'md')}>
                                        {mfaBusy ? <Spinner className="h-4 w-4" /> : null}
                                        Confirmer
                                    </button>
                                    <button type="button" onClick={resetMfaForm} className={button('secondary', 'md')}>
                                        Annuler
                                    </button>
                                </div>
                            </form>
                        )}

                        {mfaStep === 'disable' && (
                            <form onSubmit={disableMfa} className="space-y-4">
                                <p className="text-sm text-ink-600 dark:text-ink-350">
                                    Confirmez avec votre mot de passe et un code à 6 chiffres (ou un code de secours).
                                </p>
                                <label className="block">
                                    <span className={label}>Mot de passe actuel</span>
                                    <input
                                        type="password"
                                        autoComplete="current-password"
                                        value={mfaPassword}
                                        onChange={(e) => setMfaPassword(e.target.value)}
                                        className={input}
                                    />
                                </label>
                                <label className="block">
                                    <span className={label}>Code à 6 chiffres ou code de secours</span>
                                    <input
                                        autoComplete="one-time-code"
                                        value={mfaCode}
                                        onChange={(e) => setMfaCode(e.target.value.trim())}
                                        className={input}
                                    />
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="submit"
                                        disabled={mfaBusy || !mfaPassword || !mfaCode}
                                        className={button('danger', 'md')}
                                    >
                                        {mfaBusy ? <Spinner className="h-4 w-4" /> : null}
                                        Désactiver
                                    </button>
                                    <button type="button" onClick={resetMfaForm} className={button('secondary', 'md')}>
                                        Annuler
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                )}
            </SectionCard>
        </div>
    );
}
