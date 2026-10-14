import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Circle, CircleAlert, CircleCheck, Copy, Plus, Save, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { platformApi, PlatformApiError } from '../../lib/platformApi';
import { Alert, LoadingState, Spinner } from '../../components/ui/Feedback';
import { button, cardPadded, cx, input, label, select, textLink } from '../../components/ui/styles';
import Toggle from '../../components/ui/Toggle';
import type { PlatformPlan, Pressing } from '../../types';

/** Mêmes 4 paliers que `database/seeders/LoyaltyTierSeeder.php` — reflet du seeder,
 * pré-remplis ici plutôt que lus depuis un nouvel endpoint de défauts. Seuils en FCFA
 * de dépenses sur 12 mois glissants (audit « Promotions et fidélité », CLAUDE.md —
 * bascule depuis un solde de points). */
const DEFAULT_LOYALTY_TIERS: TierFormRow[] = [
    { name: 'Essentiel', minSpendAmount: '0', discountPercent: '0' },
    { name: 'Argent', minSpendAmount: '100000', discountPercent: '5' },
    { name: 'Or', minSpendAmount: '300000', discountPercent: '10' },
    { name: 'Platine', minSpendAmount: '700000', discountPercent: '15' },
];

interface TierFormRow {
    id?: number;
    name: string;
    minSpendAmount: string;
    discountPercent: string;
}

interface PressingSettings {
    primary_color: string | null;
    secondary_color: string | null;
    security_policy: {
        session_timeout_minutes: number | null;
        password_min_length: number | null;
        password_require_uppercase: boolean | null;
        password_require_number: boolean | null;
        password_require_symbol: boolean | null;
        password_expiry_days: number | null;
    };
    loyalty_tiers: Array<{ id: number; name: string; min_spend_amount: number; discount_rate: number }>;
    commercial_name: string | null;
    has_logo: boolean;
    loyalty_rules: Record<'amount_per_point' | 'point_value_fcfa' | 'expiry_months' | 'accrue_on_promotions', { value: number | boolean | null; uniform: boolean }>;
    default_amount_per_point: number;
    agencies_total: number;
    washer_step_count: number;
    sorter_step_count: number;
    admins_total: number;
    admins_with_mfa: number;
    manager_active: boolean;
    last_change: { actor: string | null; at: string | null } | null;
}

const COUNTRIES: [string, string][] = [
    ['CI', "Côte d'Ivoire"],
    ['SN', 'Sénégal'],
    ['TG', 'Togo'],
    ['BJ', 'Bénin'],
    ['BF', 'Burkina Faso'],
    ['ML', 'Mali'],
    ['NE', 'Niger'],
    ['GN', 'Guinée'],
    ['CM', 'Cameroun'],
    ['GA', 'Gabon'],
    ['CG', 'Congo'],
    ['CD', 'RD Congo'],
    ['FR', 'France'],
];

const STEPS = [
    ['identity', 'Identité'],
    ['branding', 'Branding'],
    ['license', 'Licence'],
    ['rules', 'Règles métier'],
    ['security', 'Sécurité'],
] as const;

export default function PressingFormPage() {
    const { id } = useParams<{ id: string }>();
    const isEdit = Boolean(id);
    const navigate = useNavigate();

    const [plans, setPlans] = useState<PlatformPlan[]>([]);
    const [loading, setLoading] = useState(isEdit);
    const [notFound, setNotFound] = useState(false);

    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [countryCode, setCountryCode] = useState('');
    const [platformPlanId, setPlatformPlanId] = useState('');
    const [contactName, setContactName] = useState('');
    const [contactEmail, setContactEmail] = useState('');
    const [contactPhone, setContactPhone] = useState('');
    const [licenseExpiresAt, setLicenseExpiresAt] = useState('');
    const [status, setStatus] = useState<'active' | 'suspended'>('active');

    // Provisionnement réel (pivot multi-tenant, voir CLAUDE.md) : seulement à la création —
    // la première agence et son manager sont créés avec le pressing, pas en plus.
    const [agencyCode, setAgencyCode] = useState('');
    const [agencyName, setAgencyName] = useState('');
    const [agencyCity, setAgencyCity] = useState('');
    const [managerName, setManagerName] = useState('');
    const [managerEmail, setManagerEmail] = useState('');

    // Valeurs par défaut à la provision (Chantier D.2, CLAUDE.md) — même décision :
    // page unique à sections, pas un assistant multi-écrans séparé, uniquement à la
    // création. Valeurs pré-remplies identiques aux défauts DB (ne rien changer ici
    // revient au comportement actuel).
    const [primaryColor, setPrimaryColor] = useState('#24483F');
    const [secondaryColor, setSecondaryColor] = useState('#C8A54B');
    const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState('30');
    const [passwordMinLength, setPasswordMinLength] = useState('8');
    const [passwordRequireUppercase, setPasswordRequireUppercase] = useState(true);
    const [passwordRequireNumber, setPasswordRequireNumber] = useState(true);
    const [passwordRequireSymbol, setPasswordRequireSymbol] = useState(false);
    const [passwordExpiryDays, setPasswordExpiryDays] = useState('');
    const [washerStepEnabled, setWasherStepEnabled] = useState(true);
    const [sorterStepEnabled, setSorterStepEnabled] = useState(true);
    const [loyaltyTiers, setLoyaltyTiers] = useState(DEFAULT_LOYALTY_TIERS);
    const [commercialName, setCommercialName] = useState('');
    const [licenseStartsAt, setLicenseStartsAt] = useState('');
    const [extras, setExtras] = useState<PressingSettings | null>(null);
    const [logoUrl, setLogoUrl] = useState<string | null>(null);
    const [logoBusy, setLogoBusy] = useState(false);
    // Règles de fidélité : réglages par agence — envoyés seulement s'ils ont été modifiés.
    const [amountPerPoint, setAmountPerPoint] = useState('');
    const [pointValue, setPointValue] = useState('');
    const [expiryMonths, setExpiryMonths] = useState('');
    const [accrueOnPromotions, setAccrueOnPromotions] = useState(true);
    const [rulesTouched, setRulesTouched] = useState<Set<string>>(new Set());

    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [created, setCreated] = useState<Pressing | null>(null);

    useEffect(() => {
        platformApi.get<PlatformPlan[]>('/plans').then(setPlans);
    }, []);

    useEffect(() => {
        if (!id) return;
        platformApi
            .get<Pressing>(`/pressings/${id}`)
            .then((pressing) => {
                setName(pressing.name);
                setCode(pressing.code);
                setCountryCode(pressing.country_code ?? '');
                setPlatformPlanId(String(pressing.platform_plan_id));
                setContactName(pressing.contact_name ?? '');
                setContactEmail(pressing.contact_email ?? '');
                setContactPhone(pressing.contact_phone ?? '');
                setLicenseExpiresAt(pressing.license_expires_at ? pressing.license_expires_at.slice(0, 10) : '');
                setLicenseStartsAt(pressing.license_starts_at ? pressing.license_starts_at.slice(0, 10) : '');
                setStatus(pressing.status);
            })
            .catch((err) => {
                if (err instanceof PlatformApiError && err.status === 404) setNotFound(true);
            })
            .finally(() => setLoading(false));

        // Chantier « Re-audit Pressing — édition post-création » (CLAUDE.md) :
        // couleurs/sécurité/fidélité ne sont pas portées par `Pressing` lui-même —
        // lues depuis le nouvel endpoint dédié (AppSetting/LoyaltyTier réels).
        platformApi.get<PressingSettings>(`/pressings/${id}/settings`).then((settings) => {
            setExtras(settings);
            setCommercialName(settings.commercial_name ?? '');
            const rules = settings.loyalty_rules;
            setAmountPerPoint(rules.amount_per_point.value !== null ? String(rules.amount_per_point.value) : '');
            setPointValue(rules.point_value_fcfa.value !== null ? String(rules.point_value_fcfa.value) : '');
            setExpiryMonths(rules.expiry_months.value !== null ? String(rules.expiry_months.value) : '');
            if (typeof rules.accrue_on_promotions.value === 'boolean') setAccrueOnPromotions(rules.accrue_on_promotions.value);
            if (settings.has_logo) loadLogo(id);
            if (settings.primary_color) setPrimaryColor(settings.primary_color);
            if (settings.secondary_color) setSecondaryColor(settings.secondary_color);
            const sp = settings.security_policy;
            if (sp.session_timeout_minutes !== null) setSessionTimeoutMinutes(String(sp.session_timeout_minutes));
            if (sp.password_min_length !== null) setPasswordMinLength(String(sp.password_min_length));
            if (sp.password_require_uppercase !== null) setPasswordRequireUppercase(sp.password_require_uppercase);
            if (sp.password_require_number !== null) setPasswordRequireNumber(sp.password_require_number);
            if (sp.password_require_symbol !== null) setPasswordRequireSymbol(sp.password_require_symbol);
            setPasswordExpiryDays(sp.password_expiry_days !== null ? String(sp.password_expiry_days) : '');
            if (settings.loyalty_tiers.length > 0) {
                setLoyaltyTiers(
                    settings.loyalty_tiers.map((tier) => ({
                        id: tier.id,
                        name: tier.name,
                        minSpendAmount: String(tier.min_spend_amount),
                        discountPercent: String(Math.round(tier.discount_rate * 100)),
                    })),
                );
            }
        });
    }, [id]);

    function loadLogo(pressingId: string) {
        platformApi
            .blob(`/pressings/${pressingId}/logo`)
            .then((blob) => setLogoUrl(URL.createObjectURL(blob)))
            .catch(() => setLogoUrl(null));
    }

    async function uploadLogo(file: File) {
        if (!id) return;
        setLogoBusy(true);
        setError(null);
        try {
            const form = new FormData();
            form.append('logo', file);
            await platformApi.postForm(`/pressings/${id}/logo`, form);
            setExtras((prev) => (prev ? { ...prev, has_logo: true } : prev));
            loadLogo(id);
        } catch (err) {
            setError(err instanceof PlatformApiError ? err.message : 'Logo refusé.');
        } finally {
            setLogoBusy(false);
        }
    }

    async function removeLogo() {
        if (!id) return;
        setLogoBusy(true);
        try {
            await platformApi.delete(`/pressings/${id}/logo`);
            setLogoUrl(null);
            setExtras((prev) => (prev ? { ...prev, has_logo: false } : prev));
        } finally {
            setLogoBusy(false);
        }
    }

    function touchRule(key: string) {
        setRulesTouched((prev) => new Set(prev).add(key));
    }

    async function handleSubmit() {
        setBusy(true);
        setError(null);
        try {
            // Couleurs/sécurité/fidélité sont pressing-scoped (AppSetting/LoyaltyTier) —
            // réellement éditables à la création ET après coup (Chantier « Re-audit
            // Pressing — édition post-création »). `workshop_steps` reste create-only
            // (agency-scoped, voir la décision documentée dans UpdatePressingRequest) —
            // modifiable ensuite uniquement par agence sur /settings/operational côté
            // tenant, jamais ici en édition.
            const payload = {
                name,
                code: isEdit ? undefined : code,
                country_code: countryCode || null,
                platform_plan_id: Number(platformPlanId),
                contact_name: contactName || null,
                contact_email: contactEmail || null,
                contact_phone: contactPhone || null,
                license_expires_at: licenseExpiresAt || null,
                ...(isEdit ? { license_starts_at: licenseStartsAt || null, commercial_name: commercialName || null } : {}),
                ...(isEdit && rulesTouched.size > 0
                    ? {
                          loyalty_rules: {
                              ...(rulesTouched.has('amount') && amountPerPoint ? { amount_per_point: Number(amountPerPoint) } : {}),
                              ...(rulesTouched.has('value') ? { point_value_fcfa: pointValue === '' ? null : Number(pointValue) } : {}),
                              ...(rulesTouched.has('expiry') ? { expiry_months: expiryMonths === '' ? null : Number(expiryMonths) } : {}),
                              ...(rulesTouched.has('accrue') ? { accrue_on_promotions: accrueOnPromotions } : {}),
                          },
                      }
                    : {}),
                primary_color: primaryColor,
                secondary_color: secondaryColor,
                security_policy: {
                    session_timeout_minutes: Number(sessionTimeoutMinutes),
                    password_min_length: Number(passwordMinLength),
                    password_require_uppercase: passwordRequireUppercase,
                    password_require_number: passwordRequireNumber,
                    password_require_symbol: passwordRequireSymbol,
                    password_expiry_days: passwordExpiryDays ? Number(passwordExpiryDays) : null,
                },
                loyalty_tiers: loyaltyTiers.map((tier) => ({
                    id: tier.id,
                    name: tier.name,
                    min_spend_amount: Number(tier.minSpendAmount),
                    discount_rate: Number(tier.discountPercent) / 100,
                })),
                ...(isEdit
                    ? {}
                    : {
                          agency_code: agencyCode,
                          agency_name: agencyName,
                          agency_city: agencyCity || null,
                          manager_name: managerName,
                          manager_email: managerEmail,
                          workshop_steps: {
                              washer_step_enabled: washerStepEnabled,
                              sorter_step_enabled: sorterStepEnabled,
                          },
                      }),
            };

            if (isEdit) {
                await platformApi.patch<Pressing>(`/pressings/${id}`, payload);
                navigate(`/superadmin/pressings/${id}`);
            } else {
                const result = await platformApi.post<Pressing>('/pressings', payload);
                setCreated(result);
            }
        } catch (err) {
            setError(err instanceof PlatformApiError ? err.message : 'Une erreur est survenue.');
        } finally {
            setBusy(false);
        }
    }

    async function toggleStatus() {
        if (!id) return;
        setBusy(true);
        try {
            const action = status === 'active' ? 'suspend' : 'reactivate';
            const updated = await platformApi.post<Pressing>(`/pressings/${id}/${action}`);
            setStatus(updated.status);
        } finally {
            setBusy(false);
        }
    }

    const tiersValid = loyaltyTiers.every(
        (tier) => tier.name.trim() !== '' && tier.minSpendAmount.trim() !== '' && tier.discountPercent.trim() !== '',
    );

    const canSubmit =
        name.trim() !== '' &&
        (isEdit || contactEmail.trim() !== '') &&
        platformPlanId !== '' &&
        tiersValid &&
        (isEdit ||
            (code.trim() !== '' &&
                agencyCode.trim() !== '' &&
                agencyName.trim() !== '' &&
                managerName.trim() !== '' &&
                managerEmail.trim() !== ''));

    function updateTier(index: number, patch: Partial<TierFormRow>) {
        setLoyaltyTiers((tiers) => tiers.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)));
    }

    function removeTier(index: number) {
        setLoyaltyTiers((tiers) => tiers.filter((_, i) => i !== index));
    }

    function addTier() {
        setLoyaltyTiers((tiers) => [...tiers, { name: '', minSpendAmount: '', discountPercent: '' }]);
    }

    const backLink = (
        <Link to="/superadmin/pressings" className={cx(textLink, 'inline-flex items-center gap-1.5 text-sm')}>
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Retour aux pressings
        </Link>
    );

    if (loading) {
        return <LoadingState />;
    }

    if (notFound) {
        return (
            <div className="space-y-4">
                {backLink}
                <Alert tone="error">Pressing introuvable.</Alert>
            </div>
        );
    }

    if (created) {
        return (
            <div className="max-w-xl space-y-4">
                {backLink}
                <section className={cx(cardPadded, 'space-y-4')}>
                    <h1 className="font-display text-xl font-bold text-ink-900 dark:text-white">Pressing créé</h1>
                    <p className="text-sm text-ink-600 dark:text-ink-350">
                        L'espace du pressing (agence + compte manager) est immédiatement utilisable — le manager peut se connecter dès
                        maintenant sur l'écran de connexion habituel, avec les identifiants ci-dessous.
                    </p>

                    {created.manager_email && created.manager_temporary_password && (
                        <CopyableSecret
                            title="Compte manager créé"
                            hint={`Ce mot de passe temporaire ne sera plus jamais affiché — transmettez-le à ${created.manager_email}. Le changement sera exigé à la première connexion.`}
                            lines={[
                                { text: created.manager_email },
                                { text: created.manager_temporary_password, copyable: true },
                            ]}
                        />
                    )}

                    {created.report_token && (
                        <CopyableSecret
                            title="Jeton de rapport"
                            hint="Ce jeton ne sera plus jamais affiché — à transmettre à l'équipe du pressing uniquement si elle exploite un déploiement réellement séparé qui pousse des rapports vers cette plateforme."
                            lines={[{ text: created.report_token, copyable: true }]}
                        />
                    )}

                    <div className="flex justify-end border-t border-ink-200/80 pt-4 dark:border-ink-800">
                        <Link to="/superadmin/pressings" className={button('primary', 'md')}>
                            Terminé
                        </Link>
                    </div>
                </section>
            </div>
        );
    }

    const selectedPlan = plans.find((p) => String(p.id) === platformPlanId) ?? null;
    const identityComplete = name.trim() !== '' && contactEmail.trim() !== '' && (isEdit || code.trim() !== '');
    const licenseValid = platformPlanId !== '' && (licenseExpiresAt === '' || licenseExpiresAt >= new Date().toISOString().slice(0, 10));
    const stepDone: Record<(typeof STEPS)[number][0], boolean> = {
        identity: identityComplete,
        branding: /^#[0-9A-Fa-f]{6}$/.test(primaryColor) && /^#[0-9A-Fa-f]{6}$/.test(secondaryColor),
        license: licenseValid && licenseExpiresAt !== '',
        rules: tiersValid,
        security: Number(passwordMinLength) >= 8,
    };
    const displayName = commercialName || name || 'Nouveau pressing';
    const initialsOf = displayName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join('');

    const checks: { label: string; ok: boolean | null }[] = [
        { label: 'Identité complète (nom, e-mail principal)', ok: identityComplete },
        { label: isEdit ? 'Logo renseigné' : 'Logo — ajoutable après création', ok: isEdit ? Boolean(extras?.has_logo) : null },
        { label: 'Licence valide', ok: licenseValid },
        ...(isEdit && extras
            ? [
                  { label: `Manager du pressing actif`, ok: extras.manager_active },
                  {
                      label: `MFA administrateurs (${extras.admins_with_mfa}/${extras.admins_total})`,
                      ok: extras.admins_total > 0 && extras.admins_with_mfa === extras.admins_total,
                  },
              ]
            : []),
    ];

    function ruleHint(key: keyof PressingSettings['loyalty_rules']) {
        if (!extras || extras.loyalty_rules[key].uniform) return null;
        return <span className="mt-1 block text-xs text-amber-700 dark:text-amber-400">Varie selon l'agence — une saisie s'applique à toutes.</span>;
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-accent-700 dark:text-accent-400">
                        Pressings · {isEdit ? displayName : 'Nouveau'}
                    </p>
                    <h1 className="mt-1 font-display text-2xl font-bold text-ink-900 dark:text-white">Configuration du pressing</h1>
                    <p className="mt-0.5 max-w-2xl text-sm text-ink-600 dark:text-ink-350">
                        Renseignez l'identité, la licence et les règles opérationnelles du tenant. Les champs marqués d'un astérisque sont
                        obligatoires.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link to={isEdit ? `/superadmin/pressings/${id}` : '/superadmin/pressings'} className={button('secondary', 'md')}>
                        Annuler
                    </Link>
                    <button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || busy} className={button('primary', 'md')}>
                        {busy ? <Spinner className="h-4 w-4" /> : <Save aria-hidden="true" className="h-4 w-4" />}
                        {isEdit ? 'Enregistrer les modifications' : 'Créer le pressing'}
                    </button>
                </div>
            </div>

            <nav aria-label="Étapes" className={cx(cardPadded, '!py-3')}>
                <ol className="flex flex-wrap items-center justify-between gap-3">
                    {STEPS.map(([key, text], index) => (
                        <li key={key}>
                            <a href={`#step-${key}`} className="flex items-center gap-2 text-sm font-semibold text-ink-700 hover:text-ink-900 dark:text-ink-200 dark:hover:text-white">
                                <span
                                    className={cx(
                                        'flex h-6 w-6 items-center justify-center rounded-full text-xs',
                                        stepDone[key] ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300' : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
                                    )}
                                >
                                    {stepDone[key] ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : index + 1}
                                </span>
                                {text}
                            </a>
                        </li>
                    ))}
                </ol>
            </nav>

            {error && <Alert tone="error">{error}</Alert>}

            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="min-w-0 space-y-5">
                    <FormCard id="step-identity" title="Identité de l'organisation" subtitle="Informations légales et commerciales du pressing.">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <Field label="Raison sociale *">
                                <input value={name} onChange={(e) => setName(e.target.value)} className={cx(input, 'w-full')} />
                            </Field>
                            {isEdit ? (
                                <Field label="Nom commercial" hint="Affiché dans l'espace staff, sur les tickets et factures.">
                                    <input value={commercialName} onChange={(e) => setCommercialName(e.target.value)} className={cx(input, 'w-full')} />
                                </Field>
                            ) : (
                                <Field label="Code *">
                                    <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className={cx(input, 'w-full')} />
                                </Field>
                            )}
                            <Field label="Pays">
                                <select value={countryCode} onChange={(e) => setCountryCode(e.target.value)} className={cx(select, 'w-full')}>
                                    <option value="">—</option>
                                    {COUNTRIES.map(([c, n]) => (
                                        <option key={c} value={c}>
                                            {n}
                                        </option>
                                    ))}
                                    {countryCode && !COUNTRIES.some(([c]) => c === countryCode) && <option value={countryCode}>{countryCode}</option>}
                                </select>
                            </Field>
                            <Field label="Responsable">
                                <input value={contactName} onChange={(e) => setContactName(e.target.value)} className={cx(input, 'w-full')} />
                            </Field>
                            <Field label={isEdit ? 'E-mail principal' : 'E-mail principal *'}>
                                <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={cx(input, 'w-full')} />
                            </Field>
                            <Field label="Téléphone">
                                <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={cx(input, 'w-full')} />
                            </Field>
                            {isEdit && (
                                <Field label="Code" hint="Identifiant technique, non modifiable.">
                                    <input value={code} disabled className={cx(input, 'w-full cursor-not-allowed opacity-60')} />
                                </Field>
                            )}
                        </div>
                    </FormCard>

                    {!isEdit && (
                        <FormCard id="step-provision" title="Première agence et compte manager" subtitle="Créés avec le pressing — d'autres agences pourront être ajoutées ensuite par le pressing.">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <Field label="Code agence *">
                                    <input value={agencyCode} onChange={(e) => setAgencyCode(e.target.value.toUpperCase())} className={cx(input, 'w-full')} />
                                </Field>
                                <Field label="Nom de l'agence *">
                                    <input value={agencyName} onChange={(e) => setAgencyName(e.target.value)} className={cx(input, 'w-full')} />
                                </Field>
                                <Field label="Ville">
                                    <input value={agencyCity} onChange={(e) => setAgencyCity(e.target.value)} className={cx(input, 'w-full')} />
                                </Field>
                                <div className="hidden sm:block" />
                                <Field label="Nom du manager *">
                                    <input value={managerName} onChange={(e) => setManagerName(e.target.value)} className={cx(input, 'w-full')} />
                                </Field>
                                <Field label="E-mail du manager *" hint="Un mot de passe temporaire sera affiché une seule fois après la création.">
                                    <input type="email" value={managerEmail} onChange={(e) => setManagerEmail(e.target.value)} className={cx(input, 'w-full')} />
                                </Field>
                            </div>
                        </FormCard>
                    )}

                    <FormCard id="step-branding" title="Branding" subtitle="Personnalisation appliquée aux espaces staff et aux documents.">
                        <div className="flex flex-wrap items-center gap-4">
                            <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-ink-100 font-display text-lg font-bold text-ink-700 dark:bg-ink-800 dark:text-ink-200">
                                {logoUrl ? <img src={logoUrl} alt="Logo du pressing" className="h-full w-full object-contain" /> : initialsOf}
                            </span>
                            {isEdit ? (
                                <div className="space-y-2">
                                    <p className="text-xs text-ink-500 dark:text-ink-400">PNG, JPG, SVG ou WebP — 2 Mo maximum.</p>
                                    <div className="flex flex-wrap gap-2">
                                        <label className={cx(button('secondary', 'sm'), 'cursor-pointer')}>
                                            <Upload aria-hidden="true" className="h-4 w-4" />
                                            {extras?.has_logo ? 'Remplacer' : 'Ajouter un logo'}
                                            <input
                                                type="file"
                                                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                                                className="sr-only"
                                                disabled={logoBusy}
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) void uploadLogo(file);
                                                    e.target.value = '';
                                                }}
                                            />
                                        </label>
                                        {extras?.has_logo && (
                                            <button type="button" onClick={() => void removeLogo()} disabled={logoBusy} className={button('ghost', 'sm')}>
                                                Supprimer
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <p className="text-xs text-ink-500 dark:text-ink-400">Le logo pourra être ajouté une fois le pressing créé.</p>
                            )}
                        </div>
                        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <ColorField label="Couleur principale" value={primaryColor} onChange={setPrimaryColor} />
                            <ColorField label="Couleur d'accent" value={secondaryColor} onChange={setSecondaryColor} />
                        </div>
                    </FormCard>

                    <FormCard id="step-license" title="Licence et facturation" subtitle="Périmètre contractuel et échéance du tenant.">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <Field label="Licence (plan) *">
                                <select value={platformPlanId} onChange={(e) => setPlatformPlanId(e.target.value)} className={cx(select, 'w-full')}>
                                    <option value="" disabled>
                                        Sélectionner un plan
                                    </option>
                                    {plans.map((plan) => (
                                        <option key={plan.id} value={plan.id}>
                                            {plan.name}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            <div className="hidden sm:block" />
                            {isEdit && (
                                <Field label="Date de début">
                                    <input type="date" value={licenseStartsAt} onChange={(e) => setLicenseStartsAt(e.target.value)} className={cx(input, 'w-full')} />
                                </Field>
                            )}
                            <Field label="Date de renouvellement">
                                <input type="date" value={licenseExpiresAt} onChange={(e) => setLicenseExpiresAt(e.target.value)} className={cx(input, 'w-full')} />
                            </Field>
                        </div>
                        {selectedPlan && (
                            <dl className="mt-4 grid grid-cols-1 gap-3 min-[480px]:grid-cols-3">
                                <PlanFact label="Agences incluses" value={selectedPlan.agencies_limit ?? 'Non limité'} />
                                <PlanFact label="Utilisateurs inclus" value={selectedPlan.users_limit ?? 'Non limité'} />
                                <PlanFact label="Stockage inclus" value={selectedPlan.storage_limit_gb !== null ? `${selectedPlan.storage_limit_gb} Go` : 'Non précisé'} />
                            </dl>
                        )}
                        <p className="mt-3 text-xs text-ink-500 dark:text-ink-400">
                            Les quotas sont portés par le plan (écran Plans). Le renouvellement s'enregistre depuis la fiche du pressing, au
                            paiement.
                        </p>
                    </FormCard>

                    <FormCard id="step-rules" title="Règles métier et fidélité" subtitle="Programme de fidélité du pressing.">
                        {isEdit && (
                            <>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                    <Field label="FCFA dépensés par point">
                                        <input
                                            type="number"
                                            min={1}
                                            value={amountPerPoint}
                                            placeholder={extras ? String(extras.default_amount_per_point) : ''}
                                            onChange={(e) => {
                                                setAmountPerPoint(e.target.value);
                                                touchRule('amount');
                                            }}
                                            className={cx(input, 'w-full')}
                                        />
                                        {ruleHint('amount_per_point')}
                                    </Field>
                                    <Field label="Valeur d'un point (FCFA)">
                                        <input
                                            type="number"
                                            min={0}
                                            value={pointValue}
                                            onChange={(e) => {
                                                setPointValue(e.target.value);
                                                touchRule('value');
                                            }}
                                            className={cx(input, 'w-full')}
                                        />
                                        {ruleHint('point_value_fcfa')}
                                    </Field>
                                    <Field label="Expiration (mois, vide = jamais)">
                                        <input
                                            type="number"
                                            min={1}
                                            value={expiryMonths}
                                            placeholder="Jamais"
                                            onChange={(e) => {
                                                setExpiryMonths(e.target.value);
                                                touchRule('expiry');
                                            }}
                                            className={cx(input, 'w-full')}
                                        />
                                        {ruleHint('expiry_months')}
                                    </Field>
                                </div>
                                <div className="mt-4 space-y-3 rounded-xl bg-ink-50 p-3 dark:bg-ink-950/40">
                                    <Toggle
                                        checked={accrueOnPromotions}
                                        onChange={(v) => {
                                            setAccrueOnPromotions(v);
                                            touchRule('accrue');
                                        }}
                                        label="Cumul des points avec les promotions"
                                    />
                                    <p className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-200">
                                        <Check aria-hidden="true" className="h-4 w-4 text-emerald-600" />
                                        Solde négatif interdit — garanti par l'application.
                                    </p>
                                </div>
                                <p className="mt-2 text-xs text-ink-500 dark:text-ink-400">
                                    Ces règles sont des réglages d'agence : un enregistrement les applique à toutes les agences du pressing.
                                </p>
                            </>
                        )}
                        <h3 className="mt-5 text-sm font-semibold text-ink-800 dark:text-ink-100">Niveaux de fidélité</h3>
                        <p className="text-xs text-ink-500 dark:text-ink-400">
                            {isEdit
                                ? "Retirer une ligne désactive le palier (jamais supprimé, pour ne pas casser l'historique)."
                                : 'Pré-rempli avec les paliers par défaut, modifiables avant toute activité du pressing.'}
                        </p>
                        <div className="mt-3 space-y-2">
                            {loyaltyTiers.map((tier, index) => (
                                <div key={tier.id ?? index} className="grid grid-cols-1 items-end gap-2 rounded-xl bg-ink-50 p-3 sm:grid-cols-[minmax(0,1fr)_11rem_7rem_auto] dark:bg-ink-950/40">
                                    <Field label="Nom">
                                        <input value={tier.name} onChange={(e) => updateTier(index, { name: e.target.value })} className={cx(input, 'w-full')} />
                                    </Field>
                                    <Field label="Seuil (FCFA / 12 mois)">
                                        <input
                                            type="number"
                                            min={0}
                                            value={tier.minSpendAmount}
                                            onChange={(e) => updateTier(index, { minSpendAmount: e.target.value })}
                                            className={cx(input, 'w-full')}
                                        />
                                    </Field>
                                    <Field label="Remise (%)">
                                        <input
                                            type="number"
                                            min={0}
                                            max={100}
                                            value={tier.discountPercent}
                                            onChange={(e) => updateTier(index, { discountPercent: e.target.value })}
                                            className={cx(input, 'w-full')}
                                        />
                                    </Field>
                                    <button type="button" onClick={() => removeTier(index)} aria-label="Retirer ce palier" className={cx(button('ghost', 'sm'), 'justify-self-start')}>
                                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                                    </button>
                                </div>
                            ))}
                            <button type="button" onClick={addTier} className={button('ghost', 'sm')}>
                                <Plus aria-hidden="true" className="h-4 w-4" />
                                Ajouter un palier
                            </button>
                        </div>
                    </FormCard>

                    <FormCard id="step-workflow" title="Workflow atelier" subtitle={isEdit ? 'Étapes réellement actives dans les agences.' : 'Étapes proposées à la première agence.'}>
                        <ol className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                            {[
                                ['Réception', true],
                                ['Tri', true],
                                ['Lavage', isEdit ? (extras?.washer_step_count ?? 0) > 0 : washerStepEnabled],
                                ['Classement', isEdit ? (extras?.sorter_step_count ?? 0) > 0 : sorterStepEnabled],
                                ['Contrôle qualité', true],
                                ['Prêt', true],
                            ].map(([step, on], i, all) => (
                                <li key={String(step)} className="flex items-center gap-1.5">
                                    <span className={cx('rounded-full px-2.5 py-1', on ? 'bg-ink-100 text-ink-800 dark:bg-ink-800 dark:text-ink-100' : 'bg-ink-50 text-ink-400 line-through dark:bg-ink-900')}>
                                        {step}
                                    </span>
                                    {i < all.length - 1 && <span className="text-ink-300">›</span>}
                                </li>
                            ))}
                        </ol>
                        {isEdit && extras ? (
                            <p className="mt-3 text-xs text-ink-500 dark:text-ink-400">
                                Responsable Laveur actif dans {extras.washer_step_count}/{extras.agencies_total} agence(s), Classeur dans{' '}
                                {extras.sorter_step_count}/{extras.agencies_total}. Réglage par agence, modifiable sur Paramètres opérationnels côté
                                tenant.
                            </p>
                        ) : (
                            <div className="mt-4 space-y-3 rounded-xl bg-ink-50 p-3 dark:bg-ink-950/40">
                                <Toggle checked={washerStepEnabled} onChange={setWasherStepEnabled} label="Étape Laveur (responsable affecté)" />
                                <Toggle checked={sorterStepEnabled} onChange={setSorterStepEnabled} label="Étape Classeur (responsable affecté)" />
                            </div>
                        )}
                    </FormCard>

                    <FormCard id="step-security" title="Sécurité et statut" subtitle="Politique appliquée à tous les utilisateurs du tenant.">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <Field label="Déconnexion après inactivité (min)">
                                <input type="number" min={1} value={sessionTimeoutMinutes} onChange={(e) => setSessionTimeoutMinutes(e.target.value)} className={cx(input, 'w-full')} />
                            </Field>
                            <Field label="Longueur minimale du mot de passe">
                                <input type="number" min={4} value={passwordMinLength} onChange={(e) => setPasswordMinLength(e.target.value)} className={cx(input, 'w-full')} />
                            </Field>
                            <Field label="Expiration du mot de passe (jours)">
                                <input type="number" min={1} value={passwordExpiryDays} onChange={(e) => setPasswordExpiryDays(e.target.value)} placeholder="Jamais" className={cx(input, 'w-full')} />
                            </Field>
                        </div>
                        <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl bg-ink-50 p-3 sm:grid-cols-3 dark:bg-ink-950/40">
                            <Toggle checked={passwordRequireUppercase} onChange={setPasswordRequireUppercase} label="Majuscule" />
                            <Toggle checked={passwordRequireNumber} onChange={setPasswordRequireNumber} label="Chiffre" />
                            <Toggle checked={passwordRequireSymbol} onChange={setPasswordRequireSymbol} label="Symbole" />
                        </div>
                        <p className="mt-3 flex items-center gap-2 text-sm text-ink-700 dark:text-ink-200">
                            <ShieldCheck aria-hidden="true" className="h-4 w-4 text-emerald-600" />
                            Blocage du compte après 5 tentatives échouées (15 min) — appliqué à tous les tenants.
                        </p>
                        {isEdit && (
                            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-400/20 dark:bg-red-400/10">
                                <div>
                                    <p className="text-sm font-semibold text-red-800 dark:text-red-300">
                                        {status === 'active' ? 'Suspendre le tenant' : 'Tenant suspendu'}
                                    </p>
                                    <p className="text-xs text-red-700/80 dark:text-red-300/80">
                                        {status === 'active'
                                            ? 'Bloque les connexions sans supprimer les données. Le responsable est notifié.'
                                            : 'Les connexions sont bloquées. La réactivation rétablit l’accès immédiatement.'}
                                    </p>
                                </div>
                                <button type="button" onClick={() => void toggleStatus()} disabled={busy} className={button(status === 'active' ? 'danger' : 'secondary', 'sm')}>
                                    {status === 'active' ? 'Suspendre' : 'Réactiver'}
                                </button>
                            </div>
                        )}
                    </FormCard>
                </div>

                <aside className="space-y-4 lg:sticky lg:top-6">
                    <section className="overflow-hidden rounded-2xl border border-ink-200/80 bg-white dark:border-ink-800 dark:bg-ink-900">
                        <div className="p-5 text-white" style={{ backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(primaryColor) ? primaryColor : '#24483F' }}>
                            <div className="flex items-center gap-3">
                                <span
                                    className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg text-xs font-bold text-ink-950"
                                    style={{ backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(secondaryColor) ? secondaryColor : '#C8A54B' }}
                                >
                                    {logoUrl ? <img src={logoUrl} alt="" className="h-full w-full object-contain" /> : initialsOf}
                                </span>
                                <span className="truncate text-sm font-semibold">{displayName}</span>
                            </div>
                            <p className="mt-6 font-display text-xl">Bonjour{contactName ? `, ${contactName.split(' ')[0]}` : ''}</p>
                        </div>
                        <div className="space-y-2 p-4">
                            <p className="text-xs font-semibold text-ink-700 dark:text-ink-200">Aperçu espace staff</p>
                            <div className="rounded-xl bg-ink-50 p-3 dark:bg-ink-800">
                                <p className="text-[11px] text-ink-500">Bouton principal</p>
                                <span
                                    className="mt-2 block rounded-lg py-2 text-center text-xs font-semibold text-white"
                                    style={{ backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(primaryColor) ? primaryColor : '#24483F' }}
                                >
                                    Voir l'atelier
                                </span>
                            </div>
                        </div>
                    </section>

                    <section className={cardPadded}>
                        <h2 className="text-sm font-bold text-ink-900 dark:text-ink-50">Validation</h2>
                        <ul className="mt-3 space-y-2 text-sm">
                            {checks.map((c) => (
                                <li key={c.label} className="flex items-start gap-2">
                                    {c.ok === true ? (
                                        <CircleCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                                    ) : c.ok === false ? (
                                        <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                                    ) : (
                                        <Circle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ink-300" />
                                    )}
                                    <span className="text-ink-700 dark:text-ink-200">{c.label}</span>
                                </li>
                            ))}
                        </ul>
                    </section>

                    {isEdit && extras?.last_change?.at && (
                        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-400/20 dark:bg-amber-400/10">
                            <p className="font-semibold text-amber-900 dark:text-amber-200">Dernière modification</p>
                            <p className="text-xs text-amber-800/80 dark:text-amber-200/80">
                                {extras.last_change.actor ? `Par ${extras.last_change.actor} — ` : ''}
                                {new Date(extras.last_change.at).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}
                            </p>
                        </section>
                    )}
                </aside>
            </div>
        </div>
    );
}

function FormCard({ id, title, subtitle, children }: { id: string; title: string; subtitle?: string; children: React.ReactNode }) {
    return (
        <section id={id} className={cx(cardPadded, 'scroll-mt-6')}>
            <div className="mb-4 border-b border-ink-200/70 pb-3 dark:border-ink-800">
                <h2 className="font-display text-base font-bold text-ink-900 dark:text-ink-50">{title}</h2>
                {subtitle && <p className="text-xs text-ink-500 dark:text-ink-400">{subtitle}</p>}
            </div>
            {children}
        </section>
    );
}

function Field({ label: text, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <label className="block min-w-0">
            <span className={label}>{text}</span>
            {children}
            {hint && <span className="mt-1 block text-xs text-ink-500 dark:text-ink-400">{hint}</span>}
        </label>
    );
}

function PlanFact({ label: text, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-800">
            <dt className="text-xs text-ink-500 dark:text-ink-400">{text}</dt>
            <dd className="text-sm font-semibold text-ink-900 dark:text-ink-50">{value}</dd>
        </div>
    );
}

/** Carte « secret affiché une seule fois », mirrors la bannière de mot de passe temporaire côté tenant (UsersPage.tsx). */
function CopyableSecret({
    title,
    hint,
    lines,
}: {
    title: string;
    hint: string;
    lines: Array<{ text: string; copyable?: boolean }>;
}) {
    return (
        <div className="space-y-2">
            <p className="text-sm font-semibold text-ink-800 dark:text-ink-100">{title}</p>
            <Alert tone="warning">{hint}</Alert>
            {lines.map((line, index) => (
                <div key={index} className="flex items-center gap-2 rounded-xl bg-ink-50 p-3 dark:bg-ink-950/40">
                    <code className="flex-1 break-all font-mono text-sm text-ink-900 dark:text-ink-50">{line.text}</code>
                    {line.copyable && (
                        <button
                            type="button"
                            onClick={() => navigator.clipboard.writeText(line.text)}
                            className={button('ghost', 'sm')}
                            aria-label="Copier"
                        >
                            <Copy aria-hidden="true" className="h-4 w-4" />
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
}

/** Même JSX que `ColorField` (local) de `BrandingSettingsPage.tsx` tenant — composant
 * trop petit pour justifier une extraction partagée entre les deux écrans. */
function ColorField({ label: fieldLabel, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
    return (
        <label className="block">
            <span className={label}>{fieldLabel}</span>
            <span className="flex items-center gap-2">
                <input
                    type="color"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-ink-200/80 dark:border-ink-800"
                />
                <input value={value} onChange={(e) => onChange(e.target.value)} className={cx(input, 'font-mono uppercase')} maxLength={7} />
            </span>
        </label>
    );
}
