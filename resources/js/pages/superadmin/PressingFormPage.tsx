import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, Check, Copy } from 'lucide-react';
import { platformApi, PlatformApiError } from '../../lib/platformApi';
import { Alert, LoadingState, Spinner } from '../../components/ui/Feedback';
import { Pill } from '../../components/ui/StatusBadge';
import { button, cardPadded, cx, input, label, select, textLink } from '../../components/ui/styles';
import type { PlatformPlan, Pressing } from '../../types';

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

    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [reportToken, setReportToken] = useState<string | null>(null);

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
    }, [id]);

    async function handleSubmit() {
        setBusy(true);
        setError(null);
        try {
            const payload = {
                name,
                code: isEdit ? undefined : code,
                country_code: countryCode || null,
                platform_plan_id: Number(platformPlanId),
                contact_name: contactName || null,
                contact_email: contactEmail || null,
                contact_phone: contactPhone || null,
                license_expires_at: licenseExpiresAt || null,
            };

            if (isEdit) {
                await platformApi.patch<Pressing>(`/pressings/${id}`, payload);
                navigate('/superadmin/pressings');
            } else {
                const created = await platformApi.post<Pressing>('/pressings', payload);
                setReportToken(created.report_token ?? null);
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

    const canSubmit = name.trim() !== '' && platformPlanId !== '' && (isEdit || code.trim() !== '');

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

    if (reportToken) {
        return (
            <div className="max-w-xl space-y-4">
                {backLink}
                <section className={cx(cardPadded, 'space-y-4')}>
                    <h1 className="font-display text-xl font-bold text-ink-900 dark:text-white">Pressing créé</h1>
                    <Alert tone="warning">
                        Ce jeton de rapport ne sera plus jamais affiché — copiez-le maintenant et transmettez-le à l'équipe du pressing pour
                        configurer leur déploiement.
                    </Alert>
                    <div className="flex items-center gap-2 rounded-xl bg-ink-50 p-3 dark:bg-ink-950/40">
                        <code className="flex-1 break-all font-mono text-sm text-ink-900 dark:text-ink-50">{reportToken}</code>
                        <button
                            type="button"
                            onClick={() => navigator.clipboard.writeText(reportToken)}
                            className={button('ghost', 'sm')}
                            aria-label="Copier le jeton"
                        >
                            <Copy aria-hidden="true" className="h-4 w-4" />
                        </button>
                    </div>
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
