import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Building2, Download, LayoutDashboard, Plus, Search, ShieldCheck, TriangleAlert, Users } from 'lucide-react';
import { platformApi } from '../../lib/platformApi';
import { LoadingState } from '../../components/ui/Feedback';
import { ChipToggle, ProgressBar, SectionCard, StatCard } from '../../components/ui/Metrics';
import { Pill } from '../../components/ui/StatusBadge';
import { button, card, cx, input, select } from '../../components/ui/styles';
import RevenueBars from '../../components/ui/RevenueBars';
import type { Paginated, PlatformDashboard, PlatformPlan, PlatformPressingStats, Pressing } from '../../types';
import { ActivityLabel, HealthPill, StatusPill, SyncState, countryFlag } from '../../components/superadmin/PressingStates';

type PressingFilter = '' | 'active' | 'renewal_due' | 'suspended' | 'incident';

/* Écran « Vue plateforme » (maquette superadmin) — agrégats réels uniquement. Santé
 * d'un pressing = registre d'incidents ; statut = suspension + échéance réelle de la
 * licence ; synchro = âge du dernier rapport (pressing déployé ailleurs) ou « en
 * direct » (pressing hébergé ici). Omis faute de télémétrie : carte « Santé
 * technique » (API/SYNC/PRINT), disponibilité, taux d'échec et latence — voir CLAUDE.md. */

const dateShort = (value: string) => new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(new Date(value));
const dateLong = (value: string) => new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
const operationsLabel = (n: number) => `${new Intl.NumberFormat('fr-FR').format(n)} opérations`;

export default function DashboardPage() {
    const [dashboard, setDashboard] = useState<PlatformDashboard | null>(null);
    const [pressings, setPressings] = useState<Pressing[]>([]);
    const [pressingsTotal, setPressingsTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [pressingsLoading, setPressingsLoading] = useState(false);
    const [pressingFilter, setPressingFilter] = useState<PressingFilter>('');
    const [pressingSearch, setPressingSearch] = useState('');
    const [countryFilter, setCountryFilter] = useState('');
    const [planFilter, setPlanFilter] = useState('');
    const [page, setPage] = useState(1);
    const [lastPage, setLastPage] = useState(1);
    const [stats, setStats] = useState<PlatformPressingStats | null>(null);
    const [plans, setPlans] = useState<PlatformPlan[]>([]);
    const [countries, setCountries] = useState<string[]>([]);

    useEffect(() => {
        platformApi.get<PlatformDashboard>('/dashboard').then(setDashboard).finally(() => setLoading(false));
        platformApi.get<PlatformPressingStats>('/pressings/stats').then(setStats).catch(() => setStats(null));
        platformApi.get<PlatformPlan[]>('/plans').then(setPlans).catch(() => setPlans([]));
        platformApi
            .get<Paginated<Pressing>>('/pressings?per_page=100')
            .then((res) => setCountries(Array.from(new Set(res.data.map((p) => p.country_code).filter((c): c is string => Boolean(c)))).sort()))
            .catch(() => setCountries([]));
    }, []);

    function queryParams(): URLSearchParams {
        const params = new URLSearchParams();
        if (pressingFilter) params.set('status', pressingFilter);
        if (pressingSearch) params.set('search', pressingSearch);
        if (countryFilter) params.set('country_code', countryFilter);
        if (planFilter) params.set('platform_plan_id', planFilter);
        return params;
    }

    async function exportCsv() {
        const blob = await platformApi.blob(`/pressings/export?${queryParams()}`);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pressings-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    function reloadPressings() {
        setPressingsLoading(true);
        const params = queryParams();
        params.set('per_page', '5');
        params.set('page', String(page));
        platformApi
            .get<Paginated<Pressing>>(`/pressings?${params}`)
            .then((res) => {
                setPressings(res.data);
                setPressingsTotal(res.total);
                setLastPage(res.last_page);
            })
            .finally(() => setPressingsLoading(false));
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(reloadPressings, [pressingFilter, countryFilter, planFilter, page]);

    useEffect(() => {
        const timeout = setTimeout(reloadPressings, 250);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pressingSearch]);

    if (loading || !dashboard) {
        return <LoadingState />;
    }

    const activitySeries = dashboard.activity_series.map((point) => ({ date: point.date, revenue: point.operations_count }));
    const totalOperations = dashboard.activity_series.reduce((sum, p) => sum + p.operations_count, 0);

    return (
        <div className="space-y-6">
            <header className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3.5">
                    <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-400 to-accent-600 text-ink-950 shadow-sm sm:flex">
                        <LayoutDashboard aria-hidden="true" className="h-5 w-5" strokeWidth={2} />
                    </span>
                    <div className="min-w-0">
                        <h1 className="truncate font-display text-2xl font-bold text-ink-900 dark:text-white">Vue plateforme</h1>
                        <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-350">
                            Pilotez la santé, les licences et l'activité de tous les pressings hébergés.
                        </p>
                    </div>
                </div>
                <Link to="/superadmin/pressings/new" className={button('primary', 'md')}>
                    <Plus aria-hidden="true" className="h-4 w-4" />
                    Nouveau pressing
                </Link>
            </header>

            <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Tenants actifs" value={dashboard.tenants_actifs} icon={Building2} tone="brand" hint={`${dashboard.tenants_new_this_quarter} créé(s) ce trimestre`} />
                <StatCard label="Agences" value={dashboard.agences_total} icon={Building2} tone="sky" hint={`Dans ${dashboard.countries} pays`} />
                <StatCard label="Utilisateurs" value={dashboard.utilisateurs_total} icon={Users} tone="emerald" hint={`${dashboard.users_active_today} connecté(s) aujourd'hui`} />
                <StatCard
                    label="Incidents ouverts"
                    value={dashboard.incidents.open}
                    icon={TriangleAlert}
                    tone={dashboard.incidents.open > 0 ? 'rose' : 'neutral'}
                    hint={`${dashboard.incidents.high_priority} priorité élevée (P1/P2)`}
                />
            </div>

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
                <SectionCard
                    id="platform-activity-heading"
                    title="Activité plateforme"
                    subtitle={`Opérations rapportées sur 14 jours · ${operationsLabel(totalOperations)}`}
                >
                    {totalOperations === 0 ? (
                        <p className="py-8 text-center text-sm text-ink-600 dark:text-ink-350">
                            Aucune opération rapportée sur la fenêtre — les pressings n'ont pas encore poussé de rapport.
                        </p>
                    ) : (
                        <RevenueBars series={activitySeries} money={operationsLabel} dateShort={dateShort} />
                    )}
                </SectionCard>

                <SectionCard id="platform-license-health-heading" title="État des licences" subtitle={`${dashboard.license_health.total} pressing(s) au registre`}>
                    <div className="space-y-4">
                        <div>
                            <div className="mb-1.5 flex items-center justify-between text-sm">
                                <span className="font-medium text-ink-700 dark:text-ink-200">Actives · {dashboard.license_health.active}</span>
                                <span className="font-semibold tabular-nums text-ink-900 dark:text-white">{dashboard.license_health.active_pct}%</span>
                            </div>
                            <ProgressBar value={dashboard.license_health.active_pct} max={100} barClassName="bg-emerald-600 dark:bg-emerald-400" />
                        </div>
                        <div>
                            <div className="mb-1.5 flex items-center justify-between text-sm">
                                <span className="font-medium text-ink-700 dark:text-ink-200">À renouveler (&lt;30j) · {dashboard.license_health.renewal_due}</span>
                                <span className="font-semibold tabular-nums text-ink-900 dark:text-white">{dashboard.license_health.renewal_due_pct}%</span>
                            </div>
                            <ProgressBar value={dashboard.license_health.renewal_due_pct} max={100} barClassName="bg-amber-600 dark:bg-amber-400" />
                        </div>
                        <div>
                            <div className="mb-1.5 flex items-center justify-between text-sm">
                                <span className="font-medium text-ink-700 dark:text-ink-200">Suspendues · {dashboard.license_health.suspended}</span>
                                <span className="font-semibold tabular-nums text-ink-900 dark:text-white">{dashboard.license_health.suspended_pct}%</span>
                            </div>
                            <ProgressBar value={dashboard.license_health.suspended_pct} max={100} barClassName="bg-red-600 dark:bg-red-400" />
                        </div>
                    </div>
                </SectionCard>
            </div>

            <SectionCard
                id="platform-pressings-heading"
                title="Pressings clients"
                subtitle={`${stats?.tabs.all ?? pressingsTotal} pressing(s) · ${dashboard.agences_total} agences · données isolées par pressing`}
                headerExtra={
                    <button type="button" onClick={() => void exportCsv()} className={button('secondary', 'sm')}>
                        <Download aria-hidden="true" className="h-4 w-4" />
                        Exporter
                    </button>
                }
                flush
            >
                <div role="group" aria-label="Statut" className="flex flex-wrap items-center gap-2 px-5 pb-3 sm:px-6">
                    <ChipToggle active={pressingFilter === ''} onClick={() => { setPressingFilter(''); setPage(1); }}>
                        Tous les pressings{stats ? ` (${stats.tabs.all})` : ''}
                    </ChipToggle>
                    <ChipToggle active={pressingFilter === 'active'} onClick={() => { setPressingFilter('active'); setPage(1); }}>
                        Actifs{stats ? ` (${stats.tabs.active})` : ''}
                    </ChipToggle>
                    <ChipToggle active={pressingFilter === 'renewal_due'} onClick={() => { setPressingFilter('renewal_due'); setPage(1); }}>
                        À renouveler{stats ? ` (${stats.tabs.renewal_due})` : ''}
                    </ChipToggle>
                    <ChipToggle active={pressingFilter === 'suspended'} onClick={() => { setPressingFilter('suspended'); setPage(1); }}>
                        Suspendus{stats ? ` (${stats.tabs.suspended})` : ''}
                    </ChipToggle>
                    <ChipToggle active={pressingFilter === 'incident'} onClick={() => { setPressingFilter('incident'); setPage(1); }}>
                        Incidents{stats ? ` (${stats.tabs.incident})` : ''}
                    </ChipToggle>
                </div>
                <div className="grid grid-cols-1 gap-3 px-5 pb-3 sm:grid-cols-3 sm:px-6">
                    <div className="relative">
                        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                        <input
                            type="search"
                            value={pressingSearch}
                            onChange={(e) => { setPressingSearch(e.target.value); setPage(1); }}
                            placeholder="Pressing, code…"
                            className={cx(input, 'h-10 w-full pl-9 text-sm')}
                        />
                    </div>
                    <select aria-label="Pays" value={countryFilter} onChange={(e) => { setCountryFilter(e.target.value); setPage(1); }} className={cx(select, 'h-10 text-sm')}>
                        <option value="">Tous les pays</option>
                        {countries.map((c) => (
                            <option key={c} value={c}>{countryFlag(c)} {c}</option>
                        ))}
                    </select>
                    <select aria-label="Plan" value={planFilter} onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }} className={cx(select, 'h-10 text-sm')}>
                        <option value="">Tous les plans</option>
                        {plans.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                </div>
                {pressingsLoading ? (
                    <LoadingState />
                ) : pressings.length === 0 ? (
                    <p className="px-5 py-8 text-center text-sm text-ink-600 dark:text-ink-350 sm:px-6">Aucun pressing pour ces critères.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <div className="min-w-[980px]">
                            <div role="row" className="flex items-center gap-4 border-y border-ink-200/80 bg-ink-50 px-6 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-400">
                                <span className="min-w-0 flex-1">Pressing / pays</span>
                                <span className="w-24 shrink-0">Plan</span>
                                <span className="w-44 shrink-0">Licence / usage</span>
                                <span className="w-36 shrink-0">Activité / sync</span>
                                <span className="w-24 shrink-0">Santé</span>
                                <span className="w-28 shrink-0">Statut</span>
                                <span className="w-24 shrink-0">Actions</span>
                            </div>
                            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                                {pressings.map((pressing) => (
                                    <li key={pressing.id} className="flex items-center gap-4 px-6 py-3">
                                        <div className="flex min-w-0 flex-1 items-center gap-3">
                                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-xs font-bold text-ink-700 dark:bg-ink-800 dark:text-ink-200">
                                                {pressing.name.slice(0, 2).toUpperCase()}
                                            </span>
                                            <span className="min-w-0">
                                                <span className="block truncate font-semibold text-ink-900 dark:text-ink-50">{pressing.name}</span>
                                                <span className="block text-xs text-ink-500 dark:text-ink-400">
                                                    {countryFlag(pressing.country_code)} {pressing.country_code ?? '—'}
                                                </span>
                                            </span>
                                        </div>
                                        <span className="w-24 shrink-0">{pressing.platform_plan ? <Pill tone="sky">{pressing.platform_plan.name}</Pill> : '—'}</span>
                                        <span className="w-44 shrink-0 text-xs text-ink-700 dark:text-ink-200">
                                            <span className="block">
                                                {pressing.license_expires_at
                                                    ? `${pressing.license_starts_at ? `${dateShort(pressing.license_starts_at)} – ` : "Jusqu'au "}${dateLong(pressing.license_expires_at)}`
                                                    : 'Sans licence'}
                                            </span>
                                            <span className="block text-ink-500 dark:text-ink-400">
                                                {pressing.live_agencies_count ?? pressing.agencies_count} agences · {pressing.live_users_count ?? pressing.users_count} users
                                            </span>
                                        </span>
                                        <span className="w-36 shrink-0 space-y-1 text-xs text-ink-700 dark:text-ink-200">
                                            <ActivityLabel pressing={pressing} />
                                            <span className="block"><SyncState pressing={pressing} /></span>
                                        </span>
                                        <span className="w-24 shrink-0"><HealthPill pressing={pressing} /></span>
                                        <span className="w-28 shrink-0"><StatusPill pressing={pressing} /></span>
                                        <Link to={`/superadmin/pressings/${pressing.id}`} className={cx(button('secondary', 'sm'), 'w-24 shrink-0')}>
                                            <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
                                            Ouvrir
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 px-6 py-3 text-xs text-ink-500 dark:border-ink-800 dark:text-ink-400">
                    <span>{pressings.length} résultat(s) sur {pressingsTotal}</span>
                    {lastPage > 1 && (
                        <span className="flex items-center gap-1">
                            {Array.from({ length: lastPage }, (_, i) => i + 1).map((n) => (
                                <button
                                    key={n}
                                    type="button"
                                    onClick={() => setPage(n)}
                                    aria-current={n === page ? 'page' : undefined}
                                    className={cx('h-7 min-w-7 rounded-md px-2 font-semibold', n === page ? 'bg-brand-700 text-white' : 'hover:bg-ink-100 dark:hover:bg-ink-800')}
                                >
                                    {n}
                                </button>
                            ))}
                        </span>
                    )}
                </div>
            </SectionCard>

            <SectionCard id="platform-alerts-heading" title="Alertes récentes" subtitle="Incidents ouverts du registre" action={{ to: '/superadmin/incidents', label: 'Registre' }}>
                {dashboard.incidents.recent.length === 0 ? (
                    <p className="text-sm text-ink-600 dark:text-ink-350">Aucun incident ouvert.</p>
                ) : (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        {dashboard.incidents.recent.map((incident) => (
                            <div key={incident.id} className="rounded-xl bg-ink-50 p-3 dark:bg-ink-800/60">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="truncate text-sm font-semibold text-ink-900 dark:text-white">{incident.pressing?.name ?? 'Plateforme'}</p>
                                    <Pill tone={incident.priority === 'P1' ? 'rose' : incident.priority === 'P2' ? 'amber' : 'sky'}>{incident.priority}</Pill>
                                </div>
                                <p className="mt-1 text-xs text-ink-600 dark:text-ink-350">{incident.title}</p>
                            </div>
                        ))}
                    </div>
                )}
            </SectionCard>

            <p className={cx(card, 'flex items-start gap-2.5 px-4 py-3 text-xs text-ink-500 dark:text-ink-400')}>
                <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                Santé technique (API/synchronisation/impression), disponibilité et latence ne sont pas affichées : aucune télémétrie réelle
                n'existe pour ces signaux. Les incidents proviennent du registre tenu par l'équipe plateforme.
            </p>
        </div>
    );
}
