import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    BadgeAlert,
    ChartNoAxesCombined,
    ClipboardList,
    Gem,
    MapPin,
    Network,
    PackageCheck,
    TriangleAlert,
    Wallet,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { useFormat } from '../../lib/format';
import { api, ApiError } from '../../lib/api';
import { matchPreset, presetRange, type PeriodPreset } from '../../lib/period';
import PageHeader from '../../components/ui/PageHeader';
import { Alert, EmptyState, LoadingState } from '../../components/ui/Feedback';
import { ChipToggle, ProgressBar, SectionCard, StatCard } from '../../components/ui/Metrics';
import { Pill } from '../../components/ui/StatusBadge';
import RevenueBars from '../../components/ui/RevenueBars';
import { card, cardInteractive, cx, input, label } from '../../components/ui/styles';
import type { MultiAgencyOverview } from '../../types';

/* Écran « Vue consolidée multi-agences » (captures Drive Pressing/New, 2026-10-01 :
 * Vue_consolidee_Agence.PNG + Multi_Agences.PNG). Tout ce qui est affiché provient
 * d'agrégats réels (GET /multi-agencies, App\Services\MultiAgencyService) — pas d'« objectif
 * réseau » ni de statut « en ligne » par agence : aucune cible ni télémétrie de ce type
 * n'existe en base, ces éléments de la maquette sont omis (voir CLAUDE.md). */

const PRESETS: PeriodPreset[] = ['today', '7d', '30d', 'month'];

const ALERT_ICON = { late: ClipboardList, unpaid: BadgeAlert, workshop_over_capacity: TriangleAlert } as const;

export default function MultiAgencyOverviewPage() {
    const { activeAgencyId } = useAuth();
    const { t } = useI18n();
    const { money, dayMonth } = useFormat();

    const [range, setRange] = useState(() => presetRange('month'));
    const [data, setData] = useState<MultiAgencyOverview | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!range.from || !range.to || range.from > range.to) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        const params = new URLSearchParams(range);
        if (activeAgencyId) params.set('agency_id', String(activeAgencyId));
        api
            .get<MultiAgencyOverview>(`/multi-agencies?${params}`)
            .then((res) => !cancelled && setData(res))
            .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : t('common.error')))
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeAgencyId, range.from, range.to]);

    const activePreset = matchPreset(range);
    const maxRevenue = data ? Math.max(1, ...data.agencies.map((a) => a.revenue)) : 1;

    return (
        <div className="space-y-6">
            <PageHeader title={t('multiAgency.title')} subtitle={t('multiAgency.subtitle')} icon={Network} />

            {error && <Alert tone="error">{error}</Alert>}

            <section aria-labelledby="multi-agency-period-heading" className={cx(card, 'space-y-4 p-5 sm:p-6')}>
                <h2 id="multi-agency-period-heading" className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                    {t('reports.periodTitle')}
                </h2>
                <div className="flex flex-wrap items-end gap-4">
                    <label className="block basis-full sm:basis-auto">
                        <span className={label}>{t('kpi.from')}</span>
                        <input type="date" value={range.from} max={range.to} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className={cx(input, 'sm:w-44')} />
                    </label>
                    <label className="block basis-full sm:basis-auto">
                        <span className={label}>{t('kpi.to')}</span>
                        <input type="date" value={range.to} min={range.from} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className={cx(input, 'sm:w-44')} />
                    </label>
                    <div role="group" aria-label={t('reports.shortcuts')} className="flex flex-wrap gap-2 sm:pb-1">
                        {PRESETS.map((p) => (
                            <ChipToggle key={p} active={activePreset === p} onClick={() => setRange(presetRange(p))}>
                                {t(`period.${p}`)}
                            </ChipToggle>
                        ))}
                    </div>
                </div>
            </section>

            {loading || !data ? (
                <LoadingState />
            ) : data.agencies.length === 0 ? (
                <EmptyState icon={Network} title={t('multiAgency.empty')} />
            ) : (
                <>
                    <div className="grid gap-4 grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
                        <StatCard label={t('multiAgency.kpi.revenue')} value={money(data.network.revenue)} icon={ChartNoAxesCombined} />
                        <StatCard label={t('multiAgency.kpi.deposits')} value={data.network.deposits} icon={ClipboardList} tone="sky" />
                        <StatCard label={t('multiAgency.kpi.pickups')} value={data.network.pickups} icon={PackageCheck} tone="violet" />
                        <StatCard label={t('multiAgency.kpi.cashFlowNet')} value={money(data.network.cash_flow_net)} icon={Wallet} tone="emerald" />
                        <StatCard label={t('multiAgency.kpi.outstanding')} value={money(data.network.outstanding)} icon={BadgeAlert} tone="rose" />
                        <StatCard label={t('multiAgency.kpi.loyaltyMembers')} value={data.network.loyalty_members} icon={Gem} tone="accent" />
                    </div>

                    <SectionCard id="multi-agency-revenue" title={t('multiAgency.revenueChart.title')} subtitle={t('multiAgency.revenueChart.subtitle')}>
                        <RevenueBars series={data.revenue_series} money={money} dateShort={dayMonth} />
                    </SectionCard>

                    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                        <SectionCard id="multi-agency-ranking" title={t('multiAgency.ranking.title')} subtitle={t('multiAgency.ranking.subtitle')}>
                            <ul className="space-y-3">
                                {data.agencies.map((a, i) => (
                                    <li key={a.id}>
                                        <Link to={`/multi-agences/${a.id}`} className="block rounded-xl p-2 -m-2 transition hover:bg-ink-50 dark:hover:bg-ink-800/50">
                                            <div className="flex items-center justify-between gap-2 text-sm">
                                                <span className="flex min-w-0 items-center gap-2 font-semibold text-ink-900 dark:text-ink-50">
                                                    <span className="text-ink-400 dark:text-ink-500">{i + 1}.</span>
                                                    <span className="truncate">{a.name}</span>
                                                </span>
                                                <span className="shrink-0 font-display font-bold tabular-nums text-ink-900 dark:text-white">{money(a.revenue)}</span>
                                            </div>
                                            <ProgressBar value={a.revenue} max={maxRevenue} className="mt-1.5" />
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </SectionCard>

                        <SectionCard id="multi-agency-alerts" title={t('multiAgency.alerts.title')} subtitle={t('multiAgency.alerts.subtitle')}>
                            {data.alerts.length === 0 ? (
                                <p className="text-sm text-ink-500 dark:text-ink-400">{t('multiAgency.alerts.empty')}</p>
                            ) : (
                                <ul className="space-y-2">
                                    {data.alerts.map((alert, i) => {
                                        const Icon = ALERT_ICON[alert.kind];
                                        return (
                                            <li key={i}>
                                                <Link
                                                    to={`/multi-agences/${alert.agency_id}`}
                                                    className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 transition hover:border-amber-300 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200"
                                                >
                                                    <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                                                    <span>
                                                        <span className="block font-semibold">{alert.agency_name}</span>
                                                        <span className="block">
                                                            {alert.kind === 'late' && t('multiAgency.alerts.late', { count: alert.count ?? 0 })}
                                                            {alert.kind === 'unpaid' && t('multiAgency.alerts.unpaid', { amount: money(alert.amount ?? 0), count: alert.count ?? 0 })}
                                                            {alert.kind === 'workshop_over_capacity' &&
                                                                t('multiAgency.alerts.workshopOverCapacity', { active: alert.active_count ?? 0, capacity: alert.capacity ?? 0 })}
                                                        </span>
                                                    </span>
                                                </Link>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </SectionCard>
                    </div>

                    <SectionCard id="multi-agency-comparison" flush title={t('multiAgency.comparison.title')} subtitle={t('multiAgency.comparison.subtitle')}>
                        <div className="relative overflow-x-auto">
                            <table className="w-full min-w-[640px] text-left text-sm">
                                <thead className="border-y border-ink-200/80 bg-ink-50 text-[11px] font-bold uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-400">
                                    <tr>
                                        <th scope="col" className="px-5 py-2.5 sm:px-6">{t('multiAgency.table.agency')}</th>
                                        <th scope="col" className="px-4 py-2.5 text-right">{t('multiAgency.kpi.deposits')}</th>
                                        <th scope="col" className="px-4 py-2.5 text-right">{t('multiAgency.kpi.pickups')}</th>
                                        <th scope="col" className="px-4 py-2.5 text-right">{t('multiAgency.kpi.revenue')}</th>
                                        <th scope="col" className="px-5 py-2.5 text-right sm:px-6">{t('multiAgency.table.averageBasket')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                                    {data.agencies.map((a) => (
                                        <tr key={a.id}>
                                            <td className="whitespace-nowrap px-5 py-3 sm:px-6">
                                                <Link to={`/multi-agences/${a.id}`} className="font-semibold text-ink-900 hover:underline dark:text-ink-50">
                                                    {a.name}
                                                </Link>
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums text-ink-700 dark:text-ink-200">{a.deposits}</td>
                                            <td className="px-4 py-3 text-right tabular-nums text-ink-700 dark:text-ink-200">{a.pickups}</td>
                                            <td className="px-4 py-3 text-right font-display font-bold tabular-nums text-ink-900 dark:text-white">{money(a.revenue)}</td>
                                            <td className="px-5 py-3 text-right tabular-nums text-ink-700 sm:px-6 dark:text-ink-200">{money(a.average_basket)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </SectionCard>

                    <SectionCard id="multi-agency-network" title={t('multiAgency.network.title')} subtitle={t('multiAgency.network.subtitle')}>
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            {data.agencies.map((a) => (
                                <Link key={a.id} to={`/multi-agences/${a.id}`} className={cx(cardInteractive, 'block min-w-0 space-y-2 p-4')}>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold text-ink-900 dark:text-ink-50">
                                            <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                                            <span className="truncate">{a.name}</span>
                                        </span>
                                        {a.is_active ? <Pill tone="emerald">{t('agency.active')}</Pill> : <Pill tone="rose">{t('agency.inactive')}</Pill>}
                                    </div>
                                    <p className="font-display text-lg font-bold tabular-nums text-ink-900 dark:text-white">{money(a.revenue)}</p>
                                    <p className="text-xs text-ink-500 dark:text-ink-400">{t('multiAgency.network.deposits', { count: a.deposits })}</p>
                                </Link>
                            ))}
                        </div>
                    </SectionCard>
                </>
            )}
        </div>
    );
}
