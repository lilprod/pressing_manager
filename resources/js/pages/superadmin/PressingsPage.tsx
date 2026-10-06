import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, CreditCard, Eye, LogIn, Pencil, Plus, Search } from 'lucide-react';
import { platformApi, PlatformApiError } from '../../lib/platformApi';
import { timeAgo } from '../../lib/format';
import RenewLicenseModal from '../../components/superadmin/RenewLicenseModal';
import { Alert, EmptyState, LoadingState } from '../../components/ui/Feedback';
import Pagination from '../../components/ui/Pagination';
import { Pill } from '../../components/ui/StatusBadge';
import { button, card, cx, inputLg, label, select } from '../../components/ui/styles';
import type { Paginated, PlatformPlan, Pressing } from '../../types';

export default function PressingsPage() {
    const [pressings, setPressings] = useState<Pressing[]>([]);
    const [meta, setMeta] = useState<Pick<Paginated<Pressing>, 'current_page' | 'last_page' | 'total'>>({
        current_page: 1,
        last_page: 1,
        total: 0,
    });
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [countryFilter, setCountryFilter] = useState('');
    const [planFilter, setPlanFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [plans, setPlans] = useState<PlatformPlan[]>([]);
    const [knownCountries, setKnownCountries] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [renewing, setRenewing] = useState<Pressing | null>(null);
    const [error, setError] = useState<string | null>(null);

    function reload() {
        setLoading(true);
        const params = new URLSearchParams({ page: String(page) });
        if (search) params.set('search', search);
        if (countryFilter) params.set('country_code', countryFilter);
        if (planFilter) params.set('platform_plan_id', planFilter);
        if (statusFilter) params.set('status', statusFilter);
        platformApi
            .get<Paginated<Pressing>>(`/pressings?${params}`)
            .then((res) => {
                setPressings(res.data);
                setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
                setKnownCountries((prev) => {
                    const fresh = res.data.map((p) => p.country_code).filter((c): c is string => Boolean(c));
                    return Array.from(new Set([...prev, ...fresh])).sort();
                });
            })
            .finally(() => setLoading(false));
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(reload, [page, countryFilter, planFilter, statusFilter]);

    useEffect(() => {
        setPage(1);
        const timeout = setTimeout(reload, 250);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    useEffect(() => {
        platformApi.get<PlatformPlan[]>('/plans').then(setPlans);
    }, []);

    const hasActiveFilter = Boolean(search || countryFilter || planFilter || statusFilter);
    function clearFilters() {
        setSearch('');
        setCountryFilter('');
        setPlanFilter('');
        setStatusFilter('');
    }
    const countryOptions = useMemo(() => knownCountries, [knownCountries]);

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

            <div className={cx(card, 'flex flex-wrap items-end gap-3 p-4')}>
                <div className="relative min-w-0 flex-1 basis-full sm:basis-auto">
                    <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Rechercher un pressing, un code…"
                        className={cx(inputLg, 'w-full pl-12')}
                    />
                </div>
                <label className="block">
                    <span className={label}>Pays</span>
                    <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)} className={cx(select, 'h-10 text-sm')}>
                        <option value="">Tous les pays</option>
                        {countryOptions.map((c) => (
                            <option key={c} value={c}>
                                {c}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="block">
                    <span className={label}>Licence</span>
                    <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} className={cx(select, 'h-10 text-sm')}>
                        <option value="">Toutes les licences</option>
                        {plans.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="block">
                    <span className={label}>Statut</span>
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={cx(select, 'h-10 text-sm')}>
                        <option value="">Tous les statuts</option>
                        <option value="active">Actif</option>
                        <option value="renewal_due">À renouveler (&lt;30j)</option>
                        <option value="suspended">Suspendu</option>
                    </select>
                </label>
                {hasActiveFilter && (
                    <button type="button" onClick={clearFilters} className={button('ghost', 'sm')}>
                        Effacer
                    </button>
                )}
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
                            className="hidden min-w-[1040px] items-center gap-4 border-b border-ink-200/80 bg-ink-50 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink-500 sm:flex dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-400"
                        >
                            <span className="min-w-0 flex-1">Pressing</span>
                            <span className="w-20 shrink-0">Pays</span>
                            <span className="w-24 shrink-0 text-right">Agences</span>
                            <span className="w-24 shrink-0 text-right">Utilisateurs</span>
                            <span className="w-28 shrink-0">Activité</span>
                            <span className="w-28 shrink-0">Statut</span>
                            <span className="w-36 shrink-0">Actions</span>
                        </div>
                        <ul className="min-w-[1040px] divide-y divide-ink-100 dark:divide-ink-800">
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
                                    <span className="w-28 shrink-0 text-sm text-ink-600 dark:text-ink-350">{timeAgo(pressing.last_report_at)}</span>
                                    <span className="w-28 shrink-0">
                                        <Pill tone={pressing.status === 'active' ? 'emerald' : 'neutral'}>
                                            {pressing.status === 'active' ? 'Actif' : 'Suspendu'}
                                        </Pill>
                                    </span>
                                    <span className="flex w-36 shrink-0 items-center gap-1">
                                        <Link
                                            to={`/superadmin/pressings/${pressing.id}`}
                                            aria-label={`Voir ${pressing.name}`}
                                            title="Voir le détail"
                                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-ink-600 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
                                        >
                                            <Eye aria-hidden="true" className="h-4 w-4" />
                                        </Link>
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

