import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BadgePercent, Building2, Check, Copy, Palette, Plus, Shield, Trash2, UserPlus, Workflow } from 'lucide-react';
import { platformApi, PlatformApiError } from '../../lib/platformApi';
import { Alert, LoadingState, Spinner } from '../../components/ui/Feedback';
import { Pill } from '../../components/ui/StatusBadge';
import { button, cardPadded, cx, input, label, select, textLink } from '../../components/ui/styles';
import Toggle from '../../components/ui/Toggle';
import type { PlatformPlan, Pressing } from '../../types';

/** Mêmes 3 paliers que `database/seeders/LoyaltyTierSeeder.php` — reflet du seeder,
 * pré-remplis ici plutôt que lus depuis un nouvel endpoint de défauts. */
const DEFAULT_LOYALTY_TIERS: TierFormRow[] = [
    { name: 'Argent', minPoints: '50', discountPercent: '5' },
    { name: 'Or', minPoints: '150', discountPercent: '10' },
    { name: 'Platine', minPoints: '300', discountPercent: '15' },
];

interface TierFormRow {
    id?: number;
    name: string;
    minPoints: string;
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
    loyalty_tiers: Array<{ id: number; name: string; min_points: number; discount_rate: number }>;
}

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
                        minPoints: String(tier.min_points),
                        discountPercent: String(Math.round(tier.discount_rate * 100)),
                    })),
                );
            }
        });
    }, [id]);

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
                    min_points: Number(tier.minPoints),
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
                navigate('/superadmin/pressings');
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
        (tier) => tier.name.trim() !== '' && tier.minPoints.trim() !== '' && tier.discountPercent.trim() !== '',
    );

    const canSubmit =
        name.trim() !== '' &&
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
        setLoyaltyTiers((tiers) => [...tiers, { name: '', minPoints: '', discountPercent: '' }]);
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

    return (
        <div className="max-w-xl space-y-4">
            {backLink}

            <section className={cx(cardPadded, 'space-y-5')}>
                <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink-100 text-ink-700 ring-1 ring-inset ring-ink-200 dark:bg-ink-800 dark:text-ink-200 dark:ring-ink-700">
                        <Building2 aria-hidden="true" className="h-5 w-5" />
                    </span>
                    <div>
                        <h1 className="font-display text-xl font-bold text-ink-900 dark:text-white">{isEdit ? 'Modifier le pressing' : 'Nouveau pressing'}</h1>
                        <p className="text-sm text-ink-600 dark:text-ink-350">
                            {isEdit ? 'Mettre à jour les informations de ce pressing client.' : 'Enregistrer un nouveau pressing client dans le registre.'}
                        </p>
                    </div>
                </div>

                {error && <Alert tone="error">{error}</Alert>}

                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                        <span className={label}>Nom du pressing</span>
                        <input value={name} onChange={(e) => setName(e.target.value)} className={cx(input, 'w-full')} />
                    </label>
                    <label className="block">
                        <span className={label}>Code</span>
                        <input
                            value={code}
                            disabled={isEdit}
                            onChange={(e) => setCode(e.target.value)}
                            className={cx(input, 'w-full', isEdit && 'cursor-not-allowed opacity-60')}
                        />
                    </label>
                    <label className="block">
                        <span className={label}>Pays (code ISO 2 lettres)</span>
                        <input
                            value={countryCode}
                            maxLength={2}
                            onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                            placeholder="CI"
                            className={cx(input, 'w-full uppercase')}
                        />
                    </label>
                    <label className="block">
                        <span className={label}>Plan</span>
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
                    </label>
                    <label className="block">
                        <span className={label}>Responsable</span>
                        <input value={contactName} onChange={(e) => setContactName(e.target.value)} className={cx(input, 'w-full')} />
                    </label>
                    <label className="block">
                        <span className={label}>E-mail de contact</span>
                        <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={cx(input, 'w-full')} />
                    </label>
                    <label className="block">
                        <span className={label}>Téléphone de contact</span>
                        <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={cx(input, 'w-full')} />
                    </label>
                    <label className="block">
                        <span className={label}>Licence — expire le</span>
                        <input type="date" value={licenseExpiresAt} onChange={(e) => setLicenseExpiresAt(e.target.value)} className={cx(input, 'w-full')} />
                    </label>
                </div>

                {!isEdit && (
                    <div className="space-y-5 border-t border-ink-200/80 pt-5 dark:border-ink-800">
                        <div className="flex items-center gap-2">
                            <Building2 aria-hidden="true" className="h-4 w-4 text-ink-500 dark:text-ink-400" />
                            <h2 className="text-sm font-semibold text-ink-800 dark:text-ink-100">Première agence</h2>
                        </div>
                        <p className="text-xs text-ink-500 dark:text-ink-400">
                            D'autres agences pourront être ajoutées ensuite par le pressing lui-même, une fois connecté.
                        </p>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <label className="block">
                                <span className={label}>Code agence</span>
                                <input value={agencyCode} onChange={(e) => setAgencyCode(e.target.value.toUpperCase())} className={cx(input, 'w-full')} />
                            </label>
                            <label className="block">
                                <span className={label}>Nom de l'agence</span>
                                <input value={agencyName} onChange={(e) => setAgencyName(e.target.value)} className={cx(input, 'w-full')} />
                            </label>
                            <label className="block sm:col-span-2">
                                <span className={label}>Ville</span>
                                <input value={agencyCity} onChange={(e) => setAgencyCity(e.target.value)} className={cx(input, 'w-full')} />
                            </label>
                        </div>

                        <div className="flex items-center gap-2">
                            <UserPlus aria-hidden="true" className="h-4 w-4 text-ink-500 dark:text-ink-400" />
                            <h2 className="text-sm font-semibold text-ink-800 dark:text-ink-100">Compte manager</h2>
                        </div>
                        <p className="text-xs text-ink-500 dark:text-ink-400">
                            Un mot de passe temporaire sera généré et affiché une seule fois à l'étape suivante — le manager devra le changer
                            à sa première connexion.
                        </p>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <label className="block">
                                <span className={label}>Nom du manager</span>
                                <input value={managerName} onChange={(e) => setManagerName(e.target.value)} className={cx(input, 'w-full')} />
                            </label>
                            <label className="block">
                                <span className={label}>E-mail du manager</span>
                                <input
                                    type="email"
                                    value={managerEmail}
                                    onChange={(e) => setManagerEmail(e.target.value)}
                                    className={cx(input, 'w-full')}
                                />
                            </label>
                        </div>
                    </div>
                )}

                {/* Chantier « Re-audit Pressing — édition post-création » (CLAUDE.md) :
                    couleurs/sécurité/fidélité sont pressing-scoped (AppSetting/LoyaltyTier),
                    donc sans ambiguïté multi-agence — réellement éditables ici, en création
                    ET en édition (PATCH /pressings/{id} applique désormais ces champs). */}
                <div className="space-y-5 border-t border-ink-200/80 pt-5 dark:border-ink-800">
                    <div className="flex items-center gap-2">
                        <Palette aria-hidden="true" className="h-4 w-4 text-ink-500 dark:text-ink-400" />
                        <h2 className="text-sm font-semibold text-ink-800 dark:text-ink-100">Couleurs de marque</h2>
                    </div>
                    <p className="text-xs text-ink-500 dark:text-ink-400">
                        Modifiables ici à tout moment, ou ensuite par le pressing lui-même (Paramètres → Branding).
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <ColorField label="Couleur principale" value={primaryColor} onChange={setPrimaryColor} />
                        <ColorField label="Couleur secondaire" value={secondaryColor} onChange={setSecondaryColor} />
                    </div>

                    <div className="flex items-center gap-2">
                        <Shield aria-hidden="true" className="h-4 w-4 text-ink-500 dark:text-ink-400" />
                        <h2 className="text-sm font-semibold text-ink-800 dark:text-ink-100">Sécurité par défaut</h2>
                    </div>
                    <p className="text-xs text-ink-500 dark:text-ink-400">
                        Mêmes réglages que l'écran Sécurité du pressing — modifiables ici à tout moment.
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block">
                            <span className={label}>Déconnexion après inactivité (min)</span>
                            <input
                                type="number"
                                min={1}
                                value={sessionTimeoutMinutes}
                                onChange={(e) => setSessionTimeoutMinutes(e.target.value)}
                                className={cx(input, 'w-full')}
                            />
                        </label>
                        <label className="block">
                            <span className={label}>Longueur minimale du mot de passe</span>
                            <input
                                type="number"
                                min={4}
                                value={passwordMinLength}
                                onChange={(e) => setPasswordMinLength(e.target.value)}
                                className={cx(input, 'w-full')}
                            />
                        </label>
                        <label className="block sm:col-span-2">
                            <span className={label}>Expiration du mot de passe (jours, vide = jamais)</span>
                            <input
                                type="number"
                                min={1}
                                value={passwordExpiryDays}
                                onChange={(e) => setPasswordExpiryDays(e.target.value)}
                                placeholder="Jamais"
                                className={cx(input, 'w-full')}
                            />
                        </label>
                    </div>
                    <div className="space-y-3 rounded-xl bg-ink-50 p-3 dark:bg-ink-950/40">
                        <Toggle checked={passwordRequireUppercase} onChange={setPasswordRequireUppercase} label="Exiger une majuscule" />
                        <Toggle checked={passwordRequireNumber} onChange={setPasswordRequireNumber} label="Exiger un chiffre" />
                        <Toggle checked={passwordRequireSymbol} onChange={setPasswordRequireSymbol} label="Exiger un symbole" />
                    </div>

                    <div className="flex items-center gap-2">
                        <Workflow aria-hidden="true" className="h-4 w-4 text-ink-500 dark:text-ink-400" />
                        <h2 className="text-sm font-semibold text-ink-800 dark:text-ink-100">Workflow atelier par défaut</h2>
                    </div>
                    {isEdit ? (
                        <p className="text-xs text-ink-500 dark:text-ink-400">
                            Réglage par agence (pas par pressing) — un pressing à plusieurs agences pourrait avoir des réglages
                            différents d'une agence à l'autre. Modifiable par agence sur Paramètres opérationnels, une fois connecté
                            côté tenant.
                        </p>
                    ) : (
                        <>
                            <p className="text-xs text-ink-500 dark:text-ink-400">
                                S'applique à la première agence — mêmes réglages que Paramètres opérationnels.
                            </p>
                            <div className="space-y-3 rounded-xl bg-ink-50 p-3 dark:bg-ink-950/40">
                                <Toggle checked={washerStepEnabled} onChange={setWasherStepEnabled} label="Étape Laveur activée" />
                                <Toggle checked={sorterStepEnabled} onChange={setSorterStepEnabled} label="Étape Classeur activée" />
                            </div>
                        </>
                    )}

                    <div className="flex items-center gap-2">
                        <BadgePercent aria-hidden="true" className="h-4 w-4 text-ink-500 dark:text-ink-400" />
                        <h2 className="text-sm font-semibold text-ink-800 dark:text-ink-100">Programme de fidélité par défaut</h2>
                    </div>
                    <p className="text-xs text-ink-500 dark:text-ink-400">
                        {isEdit
                            ? "Paliers réels de ce pressing — modifiables, retirer une ligne désactive le palier (jamais supprimé, pour ne pas casser l'historique)."
                            : 'Pré-rempli avec les 3 paliers par défaut — modifiables ou remplaçables ici, avant toute activité du pressing.'}
                    </p>
                    <div className="space-y-2">
                        {loyaltyTiers.map((tier, index) => (
                            <div key={tier.id ?? index} className="flex flex-wrap items-end gap-2 rounded-xl bg-ink-50 p-3 dark:bg-ink-950/40">
                                <label className="block min-w-[120px] flex-1">
                                    <span className={label}>Nom</span>
                                    <input
                                        value={tier.name}
                                        onChange={(e) => updateTier(index, { name: e.target.value })}
                                        className={cx(input, 'w-full')}
                                    />
                                </label>
                                <label className="block w-28">
                                    <span className={label}>Seuil (pts)</span>
                                    <input
                                        type="number"
                                        min={0}
                                        value={tier.minPoints}
                                        onChange={(e) => updateTier(index, { minPoints: e.target.value })}
                                        className={cx(input, 'w-full')}
                                    />
                                </label>
                                <label className="block w-28">
                                    <span className={label}>Remise (%)</span>
                                    <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={tier.discountPercent}
                                        onChange={(e) => updateTier(index, { discountPercent: e.target.value })}
                                        className={cx(input, 'w-full')}
                                    />
                                </label>
                                <button
                                    type="button"
                                    onClick={() => removeTier(index)}
                                    aria-label="Retirer ce palier"
                                    className={cx(button('ghost', 'sm'), 'shrink-0')}
                                >
                                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                        <button type="button" onClick={addTier} className={button('ghost', 'sm')}>
                            <Plus aria-hidden="true" className="h-4 w-4" />
                            Ajouter un palier
                        </button>
                    </div>
                </div>

                {isEdit && (
                    <div className="flex items-center gap-2 border-t border-ink-200/80 pt-4 dark:border-ink-800">
                        <span className="text-sm font-semibold text-ink-700 dark:text-ink-200">Statut :</span>
                        {status === 'active' ? <Pill tone="emerald">Actif</Pill> : <Pill tone="neutral">Suspendu</Pill>}
                        <button type="button" onClick={() => void toggleStatus()} disabled={busy} className={button('ghost', 'sm')}>
                            {status === 'active' ? 'Suspendre' : 'Réactiver'}
                        </button>
                    </div>
                )}

                <div className="flex justify-end gap-2 border-t border-ink-200/80 pt-5 dark:border-ink-800">
                    <Link to="/superadmin/pressings" className={button('ghost', 'md')}>
                        Annuler
                    </Link>
                    <button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || busy} className={button('primary', 'md')}>
                        {busy ? <Spinner className="h-4 w-4" /> : <Check aria-hidden="true" className="h-4 w-4" />}
                        Enregistrer
                    </button>
                </div>
            </section>
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
