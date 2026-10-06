import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, LayoutDashboard, Search, ShieldCheck, Users } from 'lucide-react';
import { platformApi } from '../../lib/platformApi';
import { timeAgo } from '../../lib/format';
import { LoadingState } from '../../components/ui/Feedback';
import { ChipToggle, ProgressBar, SectionCard, StatCard } from '../../components/ui/Metrics';
import { Pill } from '../../components/ui/StatusBadge';
import { card, cx, input } from '../../components/ui/styles';
import RevenueBars from '../../components/ui/RevenueBars';
import type { Paginated, PlatformDashboard, Pressing } from '../../types';

type PressingFilter = '' | 'active' | 'renewal_due' | 'suspended';

/* Écran « Vue plateforme » (maquette superadmin) — agrégats réels uniquement :
 * « Santé technique » (API/SYNC/PRINT), disponibilité/latence et incidents sont
 * omis (aucune télémétrie réelle n'existe) — voir CLAUDE.md. Les compteurs
 * agences/utilisateurs sont dénormalisés depuis le dernier rapport reçu de chaque
 * pressing (pas une requête live vers sa base, isolée sur son propre déploiement). */

const dateShort = (value: string) => new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(new Date(value));
const operationsLabel = (n: number) => `${new Intl.NumberFormat('fr-FR').format(n)} opérations`;

export default function DashboardPage() {
    const [dashboard, setDashboard] = useState<PlatformDashboard | null>(null);
    const [pressings, setPressings] = useState<Pressing[]>([]);
    const [pressingsTotal, setPressingsTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [pressingsLoading, setPressingsLoading] = useState(false);
    const [pressingFilter, setPressingFilter] = useState<PressingFilter>('');
    const [pressingSearch, setPressingSearch] = useState('');

    useEffect(() => {
        platformApi.get<PlatformDashboard>('/dashboard').then(setDashboard).finally(() => setLoading(false));
    }, []);

    function reloadPressings() {
        setPressingsLoading(true);
        const params = new URLSearchParams({ per_page: '8' });
        if (pressingFilter) params.set('status', pressingFilter);
        if (pressingSearch) params.set('search', pressingSearch);
        platformApi
            .get<Paginated<Pressing>>(`/pressings?${params}`)
            .then((res) => {
                setPressings(res.data);
                setPressingsTotal(res.total);
            })
            .finally(() => setPressingsLoading(false));
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(reloadPressings, [pressingFilter]);

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
                            Pilotez la santé et l'activité des pressings hébergés.
                        </p>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3">
                <StatCard label="Tenants actifs" value={dashboard.tenants_actifs} icon={Building2} tone="brand" />
                <StatCard label="Agences" value={dashboard.agences_total} icon={Building2} tone="sky" hint="Au dernier rapport reçu" />
                <StatCard label="Utilisateurs" value={dashboard.utilisateurs_total} icon={Users} tone="emerald" hint="Au dernier rapport reçu" />
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
                                <span className="font-medium text-ink-700 dark:text-ink-200">Actives</span>
                                <span className="font-semibold tabular-nums text-ink-900 dark:text-white">{dashboard.license_health.active_pct}%</span>
                            </div>
                            <ProgressBar value={dashboard.license_health.active_pct} max={100} barClassName="bg-emerald-600 dark:bg-emerald-400" />
                        </div>
                        <div>
                            <div className="mb-1.5 flex items-center justify-between text-sm">
                                <span className="font-medium text-ink-700 dark:text-ink-200">À renouveler (&lt;30j)</span>
                                <span className="font-semibold tabular-nums text-ink-900 dark:text-white">{dashboard.license_health.renewal_due_pct}%</span>
                            </div>
                            <ProgressBar value={dashboard.license_health.renewal_due_pct} max={100} barClassName="bg-amber-600 dark:bg-amber-400" />
                        </div>
                        <div>
                            <div className="mb-1.5 flex items-center justify-between text-sm">
                                <span className="font-medium text-ink-700 dark:text-ink-200">Suspendues</span>
                                <span className="font-semibold tabular-nums text-ink-900 dark:text-white">{dashboard.license_health.suspended_pct}%</span>
                            </div>
                            <ProgressBar value={dashboard.license_health.suspended_pct} max={100} barClassName="bg-red-600 dark:bg-red-400" />
                        </div>
                    </div>
                </SectionCard>
            </div>

            <SectionCard id="platform-pressings-heading" title="Pressings clients" subtitle={`${pressingsTotal} pressing(s)`} action={{ to: '/superadmin/pressings', label: 'Voir tout' }} flush>
                <div className="flex flex-wrap items-center gap-2 px-5 pb-3 sm:px-6">
                    <ChipToggle active={pressingFilter === ''} onClick={() => setPressingFilter('')}>
                        Tous
                    </ChipToggle>
                    <ChipToggle active={pressingFilter === 'active'} onClick={() => setPressingFilter('active')}>
                        Actifs
                    </ChipToggle>
                    <ChipToggle active={pressingFilter === 'renewal_due'} onClick={() => setPressingFilter('renewal_due')}>
                        À renouveler
                    </ChipToggle>
                    <ChipToggle active={pressingFilter === 'suspended'} onClick={() => setPressingFilter('suspended')}>
                        Suspendus
                    </ChipToggle>
                    <div className="relative ml-auto min-w-0 flex-1 basis-full sm:basis-56">
                        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                        <input
                            type="search"
                            value={pressingSearch}
                            onChange={(e) => setPressingSearch(e.target.value)}
                            placeholder="Rechercher…"
                            className={cx(input, 'h-9 w-full pl-9 text-sm')}
                        />
                    </div>
                </div>
                {pressingsLoading ? (
                    <LoadingState />
                ) : pressings.length === 0 ? (
                    <p className="px-5 py-8 text-center text-sm text-ink-600 dark:text-ink-350 sm:px-6">Aucun pressing enregistré.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <ul className="min-w-[640px] divide-y divide-ink-100 dark:divide-ink-800">
                            {pressings.map((pressing) => (
                                <li key={pressing.id} className="flex items-center gap-4 px-5 py-3 sm:px-6">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-semibold text-ink-900 dark:text-ink-50">{pressing.name}</p>
                                        <p className="text-xs text-ink-500 dark:text-ink-400">{pressing.code}</p>
                                    </div>
                                    <span className="w-24 shrink-0 text-right text-sm tabular-nums text-ink-600 dark:text-ink-350">
                                        {pressing.agencies_count} agence(s)
                                    </span>
                                    <span className="hidden w-24 shrink-0 text-right text-sm text-ink-600 dark:text-ink-350 sm:inline">
                                        {timeAgo(pressing.last_report_at)}
                                    </span>
                                    <Pill tone={pressing.status === 'active' ? 'emerald' : 'neutral'}>
                                        {pressing.status === 'active' ? 'Actif' : 'Suspendu'}
                                    </Pill>
                                    <Link to={`/superadmin/pressings/${pressing.id}`} className="shrink-0 text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">
                                        Ouvrir
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </SectionCard>

            <p className={cx(card, 'flex items-start gap-2.5 px-4 py-3 text-xs text-ink-500 dark:text-ink-400')}>
                <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                Les indicateurs de santé technique (API/synchronisation/impression), la disponibilité et les incidents ne sont pas encore
                affichés : aucune télémétrie réelle n'existe pour ces signaux côté plateforme.
            </p>
        </div>
    );
}
