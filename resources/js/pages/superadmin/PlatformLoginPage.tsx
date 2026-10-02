import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { ArrowRight, Check, KeyRound, Lock, ShieldCheck, User } from 'lucide-react';
import { useSuperadminAuth } from '../../contexts/SuperadminAuthContext';
import { PlatformApiError } from '../../lib/platformApi';
import { BrandLogo } from '../../components/BrandMark';
import { Alert, Spinner } from '../../components/ui/Feedback';
import { Pill } from '../../components/ui/StatusBadge';
import { button, card, cx, input, label } from '../../components/ui/styles';

/* Écran « Authentification superadmin » (maquette « Spark Pressing Superadmin ») :
 * royaume d'authentification totalement séparé du staff pressing (voir
 * SuperadminAuthContext, guard `platform` côté API). Double authentification
 * obligatoire : mot de passe, puis code TOTP — soit saisi directement (compte déjà
 * configuré), soit configuré à la première connexion (secret affiché pour saisie
 * manuelle en repli, ou scan direct du QR). Le QR est rendu côté serveur
 * (Endroid\QrCode, déjà une dépendance composer pour les étiquettes articles) —
 * pas de nouvelle dépendance JS pour cet écran. */

type Step =
    | { kind: 'credentials' }
    | { kind: 'verify'; challenge: string }
    | { kind: 'setup'; challenge: string; secret: string; qrCodeDataUri: string }
    | { kind: 'recovery-codes'; codes: string[] };

function extractSecret(otpauthUri: string): string {
    return otpauthUri.match(/secret=([^&]+)/)?.[1] ?? '';
}

export default function PlatformLoginPage() {
    const { user, loading, requestLogin, verifyMfa, confirmMfaSetup } = useSuperadminAuth();
    const [step, setStep] = useState<Step>({ kind: 'credentials' });
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [code, setCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    if (!loading && user && step.kind !== 'recovery-codes') {
        return <Navigate to="/superadmin/dashboard" replace />;
    }

    async function handleCredentials(event: FormEvent) {
        event.preventDefault();
        setError(null);
        setSubmitting(true);
        try {
            const result = await requestLogin(email, password);
            if ('mfa_setup_required' in result) {
                setStep({
                    kind: 'setup',
                    challenge: result.challenge,
                    secret: extractSecret(result.otpauth_uri),
                    qrCodeDataUri: result.qr_code_data_uri,
                });
            } else {
                setStep({ kind: 'verify', challenge: result.challenge });
            }
        } catch (err) {
            if (err instanceof PlatformApiError && err.status === 423) {
                setError(err.message);
            } else {
                setError('Identifiants invalides.');
            }
        } finally {
            setSubmitting(false);
        }
    }

    async function handleVerify(event: FormEvent, challenge: string) {
        event.preventDefault();
        setError(null);
        setSubmitting(true);
        try {
            await verifyMfa(challenge, code);
        } catch {
            setError('Code invalide.');
        } finally {
            setSubmitting(false);
        }
    }

    async function handleConfirmSetup(event: FormEvent, challenge: string) {
        event.preventDefault();
        setError(null);
        setSubmitting(true);
        try {
            const { recoveryCodes } = await confirmMfaSetup(challenge, code);
            setStep({ kind: 'recovery-codes', codes: recoveryCodes });
        } catch {
            setError('Code invalide.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-950 px-4 py-12">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-400/20 blur-3xl" />
                <div className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-accent-400/10 blur-3xl" />
            </div>
            <div className="relative w-full max-w-md space-y-6">
                <div className="flex items-center justify-center gap-2.5">
                    <BrandLogo className="h-9 w-9" />
                    <span className="font-display text-[15px] font-extrabold text-white">ADMIN Pressing</span>
                </div>

                <form
                    onSubmit={
                        step.kind === 'credentials'
                            ? handleCredentials
                            : step.kind === 'verify'
                              ? (e) => handleVerify(e, step.challenge)
                              : step.kind === 'setup'
                                ? (e) => handleConfirmSetup(e, step.challenge)
                                : undefined
                    }
                    className={cx(card, 'animate-fade-in space-y-5 p-6 sm:p-8')}
                    aria-labelledby="platform-login-heading"
                >
                    <div className="space-y-1.5">
                        <Pill tone="accent">Accès superadmin</Pill>
                        <h1 id="platform-login-heading" className="font-display text-2xl font-bold text-ink-900 dark:text-white">
                            {step.kind === 'credentials' && 'Ravi de vous revoir'}
                            {step.kind === 'verify' && 'Vérification en deux étapes'}
                            {step.kind === 'setup' && 'Configurer la double authentification'}
                            {step.kind === 'recovery-codes' && 'Codes de récupération'}
                        </h1>
                        <p className="text-sm text-ink-600 dark:text-ink-350">
                            {step.kind === 'credentials' && 'Connectez-vous avec vos identifiants d\'administration centrale.'}
                            {step.kind === 'verify' && 'Saisissez le code à 6 chiffres de votre application d\'authentification.'}
                            {step.kind === 'setup' && 'Ajoutez ce compte dans votre application d\'authentification, puis saisissez le code généré.'}
                            {step.kind === 'recovery-codes' && 'Conservez ces codes en lieu sûr : chacun ne peut être utilisé qu\'une seule fois.'}
                        </p>
                    </div>

                    {error && <Alert tone="error">{error}</Alert>}

                    {step.kind === 'credentials' && (
                        <div className="space-y-4">
                            <label className="block">
                                <span className={label}>E-mail ou identifiant</span>
                                <div className="relative">
                                    <User aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                                    <input
                                        type="email"
                                        required
                                        autoComplete="username"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className={cx(input, 'pl-10')}
                                    />
                                </div>
                            </label>
                            <label className="block">
                                <span className={label}>Mot de passe</span>
                                <div className="relative">
                                    <KeyRound aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                                    <input
                                        type="password"
                                        required
                                        autoComplete="current-password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className={cx(input, 'pl-10')}
                                    />
                                </div>
                            </label>
                        </div>
                    )}

                    {step.kind === 'setup' && (
                        <div className="space-y-3">
                            <div className="flex justify-center">
                                <img
                                    src={step.qrCodeDataUri}
                                    alt="QR code à scanner avec votre application d'authentification"
                                    className="h-40 w-40 rounded-xl border border-ink-100 bg-white p-2 dark:border-ink-800"
                                />
                            </div>
                            <div className="rounded-xl bg-ink-50 p-3 dark:bg-ink-950/40">
                                <p className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">
                                    Ou saisissez cette clé manuellement
                                </p>
                                <p className="mt-1 break-all font-mono text-sm text-ink-900 dark:text-ink-50">{step.secret}</p>
                            </div>
                            <label className="block">
                                <span className={label}>Code à 6 chiffres</span>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    maxLength={6}
                                    required
                                    value={code}
                                    onChange={(e) => setCode(e.target.value)}
                                    className={cx(input, 'text-center tracking-[0.3em]')}
                                />
                            </label>
                        </div>
                    )}

                    {step.kind === 'verify' && (
                        <label className="block">
                            <span className={label}>Code à 6 chiffres</span>
                            <input
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                maxLength={6}
                                required
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                className={cx(input, 'text-center tracking-[0.3em]')}
                            />
                        </label>
                    )}

                    {step.kind === 'recovery-codes' && (
                        <div className="grid grid-cols-2 gap-2 rounded-xl bg-ink-50 p-4 font-mono text-sm dark:bg-ink-950/40">
                            {step.codes.map((recoveryCode) => (
                                <span key={recoveryCode} className="text-ink-900 dark:text-ink-50">
                                    {recoveryCode}
                                </span>
                            ))}
                        </div>
                    )}

                    {step.kind === 'recovery-codes' ? (
                        <a href="/superadmin/dashboard" className={button('primary', 'md', 'w-full')}>
                            <Check aria-hidden="true" className="h-4 w-4" />
                            J'ai noté mes codes, continuer
                        </a>
                    ) : (
                        <button type="submit" disabled={submitting} className={button('primary', 'md', 'group w-full')}>
                            {submitting ? (
                                <Spinner className="h-4 w-4" />
                            ) : (
                                <>
                                    Se connecter en toute sécurité
                                    <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                                </>
                            )}
                        </button>
                    )}

                    {step.kind === 'credentials' && (
                        <Alert tone="info" icon={ShieldCheck}>
                            <p className="font-semibold">Sécurité renforcée</p>
                            <p className="font-normal">Une vérification MFA sera demandée. Après 5 tentatives, l'accès sera temporairement verrouillé.</p>
                        </Alert>
                    )}
                </form>

                <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-400">
                    <Lock aria-hidden="true" className="h-3.5 w-3.5" />
                    Cet espace est strictement réservé aux personnes autorisées.
                </p>
            </div>
        </div>
    );
}
