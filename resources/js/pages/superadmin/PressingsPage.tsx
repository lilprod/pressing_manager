import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, CreditCard, LogIn, Pencil, Plus, Search, X } from 'lucide-react';
import { platformApi, PlatformApiError } from '../../lib/platformApi';
import { Alert, EmptyState, LoadingState, Spinner } from '../../components/ui/Feedback';
import Pagination from '../../components/ui/Pagination';
import { Pill } from '../../components/ui/StatusBadge';
import { button, card, cx, input, inputLg, label, select } from '../../components/ui/styles';
import type { Paginated, PaymentMethod, PlatformPlan, Pressing } from '../../types';

export default function PressingsPage() {
    const [pressings, setPressings] = useState<Pressing[]>([]);
    const [meta, setMeta] = useState<Pick<Paginated<Pressing>, 'current_page' | 'last_page' | 'total'>>({
        current_page: 1,
        last_page: 1,
        total: 0,
    });
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [renewing, setRenewing] = useState<Pressing | null>(null);
    const [error, setError] = useState<string | null>(null);

    function reload() {
        setLoading(true);
        const params = new URLSearchParams({ page: String(page) });
        if (search) params.set('search', search);
        platformApi
            .get<Paginated<Pressing>>(`/pressings?${params}`)
            .then((res) => {
                setPressings(res.data);
                setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
            })
            .finally(() => setLoading(false));
    }

    useEffect(reload, [page]);

    useEffect(() => {
        setPage(1);
        const timeout = setTimeout(reload, 250);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    async function impersonate(pressing: Pressing) {
        setError(null);
        try {
            const result = await platformApi.post<{ token: string }>(`/pressings/${pressing.id}/impersonate`);
            window.open(`/impersonate?token=${encodeURIComponent(result.token)}`, '_blank');
        } catch (err) {
            setError(err instanceof PlatformApiError ? err.message : 'Une erreur est survenue.');
        }
    }

    return (
        <div className="space-y-6">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3.5">
                    <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-400 to-accent-600 text-ink-950 shadow-sm sm:flex">
                        <Building2 aria-hidden="true" className="h-5 w-5" strokeWidth={2} />
                    </span>
                    <div className="min-w-0">
                        <h1 className="truncate font-display text-2xl font-bold text-ink-900 dark:text-white">Pressings</h1>
                        <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-350">Gérez l'ensemble des pressings clients de la plateforme.</p>
                    </div>
                </div>
                <Link to="/superadmin/pressings/new" className={button('primary', 'md')}>
                    <Plus aria-hidden="true" className="h-4 w-4" />
                    Nouveau pressing
                </Link>
            </header>

            {error && <Alert tone="error">{error}</Alert>}

            <div className="relative">
                <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Rechercher un pressing, un code…"
                    className={cx(inputLg, 'pl-12')}
                />
            </div>

            <div className={cx(card, 'overflow-hidden')}>
                {loading ? (
                    <LoadingState />
                ) : pressings.length === 0 ? (
                    <EmptyState icon={Building2} title="Aucun pressing enregistré" />
                ) : (
                    <div className="overflow-x-auto">
                        <div
                            role="row"
                            className="hidden min-w-[860px] items-center gap-4 border-b border-ink-200/80 bg-ink-50 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink-500 sm:flex dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-400"
                        >
                            <span className="min-w-0 flex-1">Pressing</span>
                            <span className="w-20 shrink-0">Pays</span>
                            <span className="w-24 shrink-0 text-right">Agences</span>
                            <span className="w-24 shrink-0 text-right">Utilisateurs</span>
                            <span className="w-28 shrink-0">Statut</span>
                            <span className="w-28 shrink-0">Actions</span>
                        </div>
                        <ul className="min-w-[860px] divide-y divide-ink-100 dark:divide-ink-800">
                            {pressings.map((pressing) => (
                                <li key={pressing.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5 sm:flex-nowrap">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-semibold text-ink-900 dark:text-ink-50">{pressing.name}</p>
                                        <p className="text-xs text-ink-500 dark:text-ink-400">
                                            {pressing.code} · {pressing.platform_plan?.name ?? '—'}
                                        </p>
                                    </div>
                                    <span className="w-20 shrink-0 text-sm text-ink-600 dark:text-ink-350">{pressing.country_code ?? '—'}</span>
                                    <span className="w-24 shrink-0 text-right text-sm tabular-nums text-ink-900 dark:text-white">{pressing.agencies_count}</span>
                                    <span className="w-24 shrink-0 text-right text-sm tabular-nums text-ink-900 dark:text-white">{pressing.users_count}</span>
                                    <span className="w-28 shrink-0">
                                        <Pill tone={pressing.status === 'active' ? 'emerald' : 'neutral'}>
                                            {pressing.status === 'active' ? 'Actif' : 'Suspendu'}
                                        </Pill>
                                    </span>
                                    <span className="flex w-28 shrink-0 items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => setRenewing(pressing)}
                                            aria-label={`Enregistrer un paiement pour ${pressing.name}`}
                                            title="Enregistrer un paiement"
                                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-ink-600 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
                                        >
                                            <CreditCard aria-hidden="true" className="h-4 w-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void impersonate(pressing)}
                                            aria-label={`Se connecter en tant que ${pressing.name}`}
                                            title="Se connecter en tant que"
                                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-ink-600 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
                                        >
                                            <LogIn aria-hidden="true" className="h-4 w-4" />
                                        </button>
                                        <Link
                                            to={`/superadmin/pressings/${pressing.id}/edit`}
                                            aria-label={`Modifier ${pressing.name}`}
                                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-ink-600 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
                                        >
                                            <Pencil aria-hidden="true" className="h-4 w-4" />
                                        </Link>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                <Pagination meta={meta} onPageChange={setPage} />
            </div>

            {renewing && <RenewLicenseModal pressing={renewing} onClose={() => setRenewing(null)} onRenewed={reload} />}
        </div>
    );
}

function RenewLicenseModal({ pressing, onClose, onRenewed }: { pressing: Pressing; onClose: () => void; onRenewed: () => void }) {
    const [plans, setPlans] = useState<PlatformPlan[]>([]);
    const [planId, setPlanId] = useState<number | ''>('');
    const [method, setMethod] = useState<PaymentMethod>('espece');
    const [externalReference, setExternalReference] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        platformApi.get<PlatformPlan[]>('/plans').then((data) => {
            setPlans(data);
            if (data[0]) setPlanId(data[0].id);
        });
    }, []);

    async function submit() {
        setBusy(true);
        setError(null);
        try {
            await platformApi.post(`/pressings/${pressing.id}/renew`, {
                platform_plan_id: planId,
                method,
                external_reference: externalReference || null,
            });
            setSuccess(true);
            onRenewed();
        } catch (err) {
            setError(err instanceof PlatformApiError ? err.message : 'Une erreur est survenue.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
            <section className={cx(card, 'w-full max-w-md space-y-4 p-6')}>
                <div className="flex items-center justify-between">
                    <h2 className="font-display text-lg font-bold text-ink-900 dark:text-white">Enregistrer un paiement — {pressing.name}</h2>
                    <button type="button" onClick={onClose} aria-label="Fermer" className="text-ink-500 hover:text-ink-700 dark:text-ink-400">
                        <X aria-hidden="true" className="h-4 w-4" />
                    </button>
                </div>
                <p className="text-xs text-ink-600 dark:text-ink-350">
                    Confirme un règlement déjà perçu (espèces ou Mobile Money) et prolonge la licence du pressing en conséquence.
                </p>

                {error && <Alert tone="error">{error}</Alert>}
                {success && <Alert tone="success">Licence renouvelée avec succès.</Alert>}

                <label className="block">
                    <span className={label}>Plan</span>
                    <select value={planId} onChange={(e) => setPlanId(e.target.value ? Number(e.target.value) : '')} className={select}>
                        <option value="">Sélectionner un plan</option>
                        {plans.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name} — {p.price !== null ? `${p.price.toLocaleString('fr-FR')} ${p.currency}` : '—'} / {p.duration_days ?? '—'}j
                            </option>
                        ))}
                    </select>
                </label>

                <label className="block">
                    <span className={label}>Moyen de paiement</span>
                    <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={select}>
                        <option value="espece">Espèces</option>
                        <option value="flooz">Flooz</option>
                        <option value="tmoney">T-Money</option>
                        <option value="carte">Carte</option>
                    </select>
                </label>

                <label className="block">
                    <span className={label}>Référence externe (optionnel)</span>
                    <input value={externalReference} onChange={(e) => setExternalReference(e.target.value)} className={cx(input, 'w-full')} />
                </label>

                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} className={button('secondary', 'md')}>
                        Fermer
                    </button>
                    <button type="button" onClick={() => void submit()} disabled={busy || !planId} className={button('primary', 'md')}>
                        {busy ? <Spinner className="h-4 w-4" /> : null}
                        Confirmer le paiement
                    </button>
                </div>
            </section>
        </div>
    );
}
