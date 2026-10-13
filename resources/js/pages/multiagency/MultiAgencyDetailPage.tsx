import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
    ArrowLeft,
    ChartNoAxesCombined,
    ClipboardList,
    Gem,
    MapPin,
    PackageCheck,
    ScrollText,
    UsersRound,
    Wallet,
    Workflow,
    Phone,
    Settings2,
} from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { useFormat } from '../../lib/format';
import { api, ApiError } from '../../lib/api';
import { auditLogLabel, auditTypeLabel } from '../../lib/auditLog';
import { matchPreset, presetRange, type PeriodPreset } from '../../lib/period';
import PageHeader from '../../components/ui/PageHeader';
import { Alert, EmptyState, LoadingState } from '../../components/ui/Feedback';
import { ChipToggle, DeltaBadge, SectionCard, StatCard, percentChange } from '../../components/ui/Metrics';
import { Pill } from '../../components/ui/StatusBadge';
import RevenueBars from '../../components/ui/RevenueBars';
import { button, card, cx, input, label, textLink } from '../../components/ui/styles';
import { useAuth } from '../../contexts/AuthContext';
import { hasPermission } from '../../lib/permissions';
import type { MultiAgencyDetail } from '../../types';

const PRESETS: PeriodPreset[] = ['today', '7d', '30d', 'month'];

const WORKSHOP_COLUMNS: { key: keyof MultiAgencyDetail['workshop']['columns']; tone: string }[] = [
    { key: 'attente', tone: 'bg-ink-400' },
    { key: 'cours', tone: 'bg-sky-500' },
    { key: 'traites', tone: 'bg-amber-500' },
    { key: 'classes', tone: 'bg-emerald-600' },
];

export default function MultiAgencyDetailPage() {
    const { id } = useParams<{ id: string }>();
    const { t } = useI18n();
    const { user } = useAuth();
    const { money, dateTime, dayMonth } = useFormat();

    const [range, setRange] = useState(() => presetRange('month'));
    const [data, setData] = useState<MultiAgencyDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        if (!id || !range.from || !range.to || range.from > range.to) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        const params = new URLSearchParams(range);
        api
            .get<MultiAgencyDetail>(`/multi-agencies/${id}?${params}`)
            .then((res) => !cancelled && setData(res))
            .catch((err) => {
                if (cancelled) return;
                if (err instanceof ApiError && err.status === 404) setNotFound(true);
                else setError(err instanceof ApiError ? err.message : t('common.error'));
            })
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, range.from, range.to]);

    const activePreset = matchPreset(range);

    const backLink = (
        <Link to="/multi-agences" className={cx(textLink, 'inline-flex items-center gap-1.5 text-sm')}>
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            {t('multiAgency.backToOverview')}
        </Link>
    );

    if (notFound) {
        return (
            <div className="space-y-4">
                {backLink}
                <Alert tone="error">{t('agency.notFound')}</Alert>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {backLink}

            {error && <Alert tone="error">{error}</Alert>}

            {loading || !data ? (
                <LoadingState />
            ) : (
                <>
                    <PageHeader
                        title={data.agency.name}
                        subtitle={[data.agency.address, data.agency.city].filter(Boolean).join(' — ') || undefined}
                        icon={MapPin}
                        actions={
                            <div className="flex flex-wrap items-center gap-2">
                                {!data.agency.is_active ? (
                                    <Pill tone="rose">{t('agency.inactive')}</Pill>
                                ) : data.agency.is_open_now === null ? (
                                    <Pill tone="emerald">{t('agency.active')}</Pill>
                                ) : (
                                    <Pill tone={data.agency.is_open_now ? 'emerald' : 'neutral'}>
                                        {data.agency.is_open_now ? t('multiAgency.open') : t('multiAgency.closed')} · {data.agency.opens_at}–{data.agency.closes_at}
                                    </Pill>
                                )}
                                {data.agency.phone && (
                                    <a href={`tel:${data.agency.phone.replace(/\s+/g, '')}`} className={button('secondary', 'sm')}>
                                        <Phone aria-hidden="true" className="h-4 w-4" />
                                        {t('multiAgency.contact')}
                                    </a>
                                )}
                                {hasPermission(user, 'agencies.manage') && (
                                    <Link to={`/agencies/${data.agency.id}/edit`} className={button('primary', 'sm')}>
                                        <Settings2 aria-hidden="true" className="h-4 w-4" />
                                        {t('multiAgency.manage')}
                                    </Link>
                                )}
                            </div>
                        }
                    />

                    <section aria-labelledby="multi-agency-detail-period" className={cx(card, 'space-y-4 p-5 sm:p-6')}>
                        <h2 id="multi-agency-detail-period" className="text-sm font-semibold text-ink-900 dark:text-ink-50">
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

                    <div className="grid gap-4 grid-cols-1 min-[480px]:grid-cols-2 sm:grid-cols-4">
                        <StatCard label={t('multiAgency.kpi.revenue')} value={money(data.kpis.revenue)} icon={ChartNoAxesCombined} />
                        <StatCard label={t('multiAgency.kpi.deposits')} value={data.kpis.deposits} icon={ClipboardList} tone="sky" />
                        <StatCard label={t('multiAgency.kpi.pickups')} value={data.kpis.pickups} icon={PackageCheck} tone="violet" />
                        <StatCard label={t('multiAgency.kpi.cashFlowNet')} value={money(data.kpis.cash_flow_net)} icon={Wallet} tone="emerald" />
                    </div>

                    <SectionCard id="multi-agency-detail-revenue" title={t('multiAgency.revenueChart.title')} subtitle={t('multiAgency.revenueChart.subtitle')}>
                        <RevenueBars series={data.revenue_series} money={money} dateShort={dayMonth} />
                    </SectionCard>

                    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
                        <SectionCard id="multi-agency-detail-workshop" title={t('multiAgency.workshop.title')} subtitle={t('multiAgency.workshop.subtitle')} headerExtra={<Workflow aria-hidden="true" className="h-4 w-4 text-ink-400" />}>
                            <p className="text-sm text-ink-600 dark:text-ink-350">
                                {t('multiAgency.workshop.capacity', { active: data.workshop.active_count, capacity: data.workshop.capacity })}
                            </p>
                            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                {WORKSHOP_COLUMNS.map(({ key, tone }) => (
                                    <div key={key} className="min-w-0">
                                        <dt className="flex items-center gap-1.5 text-xs font-medium text-ink-600 dark:text-ink-350">
                                            <span className={cx('h-2 w-2 shrink-0 rounded-full', tone)} />
                                            {t(`atelier.column.${key}`)}
                                        </dt>
                                        <dd className="font-display text-xl font-bold tabular-nums text-ink-900 dark:text-white">{data.workshop.columns[key]}</dd>
                                    </div>
                                ))}
                            </dl>
                        </SectionCard>

                        {data.network_comparison && (
                            <SectionCard id="multi-agency-detail-comparison" title={t('multiAgency.networkComparison.title')} subtitle={t('multiAgency.networkComparison.subtitle', { rank: data.network_comparison.rank ?? '—', count: data.network_comparison.agency_count })}>
                                <dl className="grid grid-cols-1 gap-x-6 gap-y-4 min-[480px]:grid-cols-2">
                                    <ComparisonMetric label={t('multiAgency.kpi.revenue')} mine={money(data.kpis.revenue)} delta={percentChange(data.kpis.revenue, data.network_comparison.avg_revenue)} />
                                    <ComparisonMetric label={t('multiAgency.table.averageBasket')} mine={money(data.kpis.average_basket)} delta={percentChange(data.kpis.average_basket, data.network_comparison.avg_basket)} />
                                    <ComparisonMetric
                                        label={t('multiAgency.kpi.outstanding')}
                                        mine={money(data.kpis.outstanding)}
                                        delta={percentChange(data.kpis.outstanding, data.network_comparison.avg_outstanding)}
                                        positiveIsGood={false}
                                    />
                                    <ComparisonMetric
                                        label={t('multiAgency.kpi.lateOrders')}
                                        mine={String(data.kpis.late_orders)}
                                        delta={percentChange(data.kpis.late_orders, data.network_comparison.avg_late_orders)}
                                        positiveIsGood={false}
                                    />
                                </dl>
                            </SectionCard>
                        )}
                    </div>

                    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
                        <SectionCard id="multi-agency-detail-deposits" title={t('multiAgency.deposits.title')} subtitle={t('multiAgency.deposits.subtitle', { deposits: data.deposits_summary.deposits, pickups: data.deposits_summary.pickups })}>
                            <dl className="divide-y divide-ink-100 text-sm dark:divide-ink-800">
                                <Row label={t('multiAgency.deposits.express')} hint={t('multiAgency.deposits.expressHint', { percent: data.deposits_summary.express_rate })} value={String(data.deposits_summary.express)} />
                                <Row label={t('multiAgency.deposits.onTime')} value={data.deposits_summary.on_time_rate === null ? '—' : `${data.deposits_summary.on_time_rate} %`} />
                                <Row label={t('multiAgency.table.averageBasket')} value={money(data.deposits_summary.average_basket)} />
                                <Row label={t('multiAgency.deposits.deliveries')} value={String(data.deposits_summary.deliveries)} />
                            </dl>
                            <div className="flex flex-wrap gap-2">
                                <Link to="/" className={button('primary', 'sm')}>{t('nav.newOrder')}</Link>
                                <Link to="/pickups" className={button('secondary', 'sm')}>{t('multiAgency.deposits.recordPickup')}</Link>
                            </div>
                        </SectionCard>

                        <SectionCard id="multi-agency-detail-cash" title={t('multiAgency.cash.title')} subtitle={t('multiAgency.cash.subtitle')}>
                            <dl className="divide-y divide-ink-100 text-sm dark:divide-ink-800">
                                <Row label={t('multiAgency.cash.expected')} value={money(data.cash_today.expected_balance)} />
                                <Row label={t('multiAgency.cash.collected')} value={`+${money(data.cash_today.collected_today)}`} />
                                <Row label={t('multiAgency.cash.expenses')} value={`−${money(data.cash_today.expenses_today)}`} />
                                <Row
                                    label={t('multiAgency.cash.variance')}
                                    value={data.cash_today.last_closure ? money(data.cash_today.last_closure.variance) : t('dailyReport.noClosureYet')}
                                />
                            </dl>
                            {hasPermission(user, 'payments.manage') && (
                                <div className="flex flex-wrap gap-2">
                                    <Link to="/cash" className={button('primary', 'sm')}>{t('multiAgency.cash.open')}</Link>
                                    <Link to="/cash/closures/new" className={button('secondary', 'sm')}>{t('cash.closeRegister')}</Link>
                                </div>
                            )}
                        </SectionCard>
                    </div>

                    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
                        <SectionCard id="multi-agency-detail-clients" title={t('multiAgency.clients.title')} headerExtra={<Gem aria-hidden="true" className="h-4 w-4 text-ink-400" />}>
                            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                                <SimpleMetric label={t('multiAgency.clients.active')} value={data.clients.active} />
                                <SimpleMetric label={t('multiAgency.clients.newThisPeriod')} value={data.clients.new_this_period} />
                                <SimpleMetric label={t('multiAgency.kpi.loyaltyMembers')} value={data.kpis.loyalty_members} />
                                <SimpleMetric label={t('client.loyaltyPoints')} value={data.kpis.loyalty_points} />
                            </dl>
                        </SectionCard>

                        <SectionCard id="multi-agency-detail-unpaid" title={t('multiAgency.lateAndUnpaid.title')}>
                            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                                <SimpleMetric label={t('multiAgency.lateAndUnpaid.lateOrders')} value={data.kpis.late_orders} warn={data.kpis.late_orders > 0} />
                                <SimpleMetric label={t('multiAgency.lateAndUnpaid.unpaidClients')} value={data.kpis.unpaid_clients} warn={data.kpis.unpaid_clients > 0} />
                                <SimpleMetric label={t('multiAgency.kpi.outstanding')} value={money(data.kpis.outstanding)} warn={data.kpis.outstanding > 0} />
                            </dl>
                        </SectionCard>
                    </div>

                    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
                        <SectionCard id="multi-agency-detail-team" title={t('multiAgency.team.title')} subtitle={t('multiAgency.team.subtitle')} headerExtra={<UsersRound aria-hidden="true" className="h-4 w-4 text-ink-400" />}>
                            {data.team_present.length === 0 ? (
                                <EmptyState compact icon={UsersRound} title={t('multiAgency.team.empty')} />
                            ) : (
                                <ul className="space-y-2">
                                    {data.team_present.map((member, i) => (
                                        <li key={i} className="flex items-center justify-between gap-2 text-sm">
                                            <span className="font-medium text-ink-800 dark:text-ink-100">{member.user?.name ?? '—'}</span>
                                            <span className="text-xs text-ink-500 dark:text-ink-400">{dateTime(member.clock_in)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </SectionCard>

                        <SectionCard id="multi-agency-detail-activity" title={t('multiAgency.recentActivity.title')} headerExtra={<ScrollText aria-hidden="true" className="h-4 w-4 text-ink-400" />}>
                            {data.recent_activity.length === 0 ? (
                                <EmptyState compact icon={ScrollText} title={t('multiAgency.recentActivity.empty')} />
                            ) : (
                                <ul className="space-y-2">
                                    {data.recent_activity.map((log) => (
                                        <li key={log.id} className="flex items-start justify-between gap-2 text-sm">
                                            <span className="min-w-0">
                                                <Pill tone="neutral" className="mb-1">{auditTypeLabel(log.auditable_type, t)}</Pill>
                                                <span className="block text-ink-800 dark:text-ink-100">{auditLogLabel(log, t, money)}</span>
                                            </span>
                                            <span className="shrink-0 text-xs text-ink-500 dark:text-ink-400">{dateTime(log.created_at)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </SectionCard>
                    </div>
                </>
            )}
        </div>
    );
}

function SimpleMetric({ label: title, value, warn = false }: { label: string; value: string | number; warn?: boolean }) {
    return (
        <div className="min-w-0">
            <dt className="text-xs font-medium text-ink-600 dark:text-ink-350">{title}</dt>
            <dd className={cx('font-display text-lg font-bold tabular-nums', warn ? 'text-red-700 dark:text-red-300' : 'text-ink-900 dark:text-white')}>{value}</dd>
        </div>
    );
}

function ComparisonMetric({ label: title, mine, delta, positiveIsGood = true }: { label: string; mine: string; delta: number | null; positiveIsGood?: boolean }) {
    return (
        <div className="min-w-0">
            <dt className="text-xs font-medium text-ink-600 dark:text-ink-350">{title}</dt>
            <dd className="flex flex-wrap items-center gap-x-2 gap-y-1 font-display text-lg font-bold tabular-nums text-ink-900 dark:text-white">
                <span className="truncate">{mine}</span>
                {delta !== null && <DeltaBadge value={delta} positiveIsGood={positiveIsGood} />}
            </dd>
        </div>
    );
}

function Row({ label: rowLabel, hint, value }: { label: string; hint?: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-3 py-2.5">
            <dt className="min-w-0">
                <span className="block font-medium text-ink-800 dark:text-ink-100">{rowLabel}</span>
                {hint && <span className="block text-xs text-ink-500 dark:text-ink-400">{hint}</span>}
            </dt>
            <dd className="shrink-0 font-semibold tabular-nums text-ink-900 dark:text-white">{value}</dd>
        </div>
    );
}
