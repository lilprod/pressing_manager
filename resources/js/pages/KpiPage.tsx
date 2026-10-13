import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    ArrowLeftRight,
    ArrowUpRight,
    BadgeAlert,
    BadgePercent,
    CalendarDays,
    ChartNoAxesCombined,
    FileDown,
    FileSpreadsheet,
    FileText,
    Clock,
    Gem,
    Inbox,
    PackageOpen,
    Wallet,
    Trash2,
    MapPin,
    Receipt,
    ReceiptText,
    UsersRound,
    type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useFormat } from '../lib/format';
import { api, ApiError } from '../lib/api';
import { hasPermission } from '../lib/permissions';
import { matchPreset, presetRange, previousRange, type DateRange, type PeriodPreset } from '../lib/period';
import PageHeader from '../components/ui/PageHeader';
import { Alert, LoadingState, Spinner } from '../components/ui/Feedback';
import { ChipToggle, DeltaBadge, percentChange, trend, SectionCard, StatCard } from '../components/ui/Metrics';
import { Pill } from '../components/ui/StatusBadge';
import RevenueBars from '../components/ui/RevenueBars';
import SegmentedBar from '../components/ui/SegmentedBar';
import { button, cardPadded, cx, input, label, select } from '../components/ui/styles';
import type { KpiData, ReportSchedule, RevenueSeriesResponse } from '../types';

/* Écran « Rapports et bilans » (capture Figma, audit du 2026-10-13). Huit indicateurs
 * réels (GET /kpi), filtre agence et comparaison (période précédente ou même période
 * l'an dernier), histogramme CA / ventes / panier moyen, répartition des paiements,
 * mouvements de caisse, programme fidélité, comparaison inter-agences, exports
 * PDF / Excel / CSV et envois programmés (report_schedules + commande planifiée).
 * Omis : courbe de projection (aucun modèle prévisionnel). */

const PRESETS: PeriodPreset[] = ['today', '7d', 'month', 'year'];

/** Légende d'un point de la série CA, adaptée à la granularité choisie — un mois
 * affiché en « 01 oct. » serait trompeur (on veut « oct. 2026 », pas un jour). */
function seriesLabel(value: string, granularity: 'day' | 'week' | 'month', lang: string): string {
    const locale = lang === 'fr' ? 'fr-FR' : 'en-GB';
    const date = new Date(value);
    if (granularity === 'month') {
        return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' }).format(date);
    }
    return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' }).format(date);
}

/** Période de comparaison : précédente de même durée, ou même période l'an dernier. */
function comparisonRange(range: DateRange, mode: 'previous' | 'last_year'): DateRange {
    if (mode === 'previous') return previousRange(range);
    const shift = (value: string) => {
        const d = new Date(value);
        d.setFullYear(d.getFullYear() - 1);
        return d.toISOString().slice(0, 10);
    };
    return { from: shift(range.from), to: shift(range.to) };
}

function ScheduleCard({ agencyId }: { agencyId: number | null }) {
    const { t } = useI18n();
    const { dateTime } = useFormat();
    const [schedules, setSchedules] = useState<ReportSchedule[]>([]);
    const [frequency, setFrequency] = useState<ReportSchedule['frequency']>('weekly');
    const [format, setFormat] = useState<ReportSchedule['format']>('pdf');
    const [recipients, setRecipients] = useState('');
    const [error, setError] = useState<string | null>(null);

    const load = () => void api.get<ReportSchedule[]>('/report-schedules').then(setSchedules).catch(() => setSchedules([]));
    useEffect(load, []);

    async function create() {
        setError(null);
        try {
            await api.post('/report-schedules', {
                frequency,
                format,
                agency_id: agencyId,
                recipients: recipients.split(/[,;\s]+/).map((r) => r.trim()).filter(Boolean),
            });
            setRecipients('');
            load();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        }
    }

    return (
        <SectionCard id="reports-schedules" title={t('reports.schedule.title')} subtitle={t('reports.schedule.subtitle')}>
            {error && <Alert tone="error">{error}</Alert>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(2,minmax(0,160px))_minmax(0,1fr)_auto] sm:items-end">
                <label className="block">
                    <span className={label}>{t('reports.schedule.frequency')}</span>
                    <select value={frequency} onChange={(e) => setFrequency(e.target.value as ReportSchedule['frequency'])} className={select}>
                        {(['daily', 'weekly', 'monthly'] as const).map((f) => (
                            <option key={f} value={f}>{t(`reports.schedule.${f}`)}</option>
                        ))}
                    </select>
                </label>
                <label className="block">
                    <span className={label}>{t('reports.schedule.format')}</span>
                    <select value={format} onChange={(e) => setFormat(e.target.value as ReportSchedule['format'])} className={select}>
                        <option value="pdf">PDF</option>
                        <option value="excel">Excel</option>
                        <option value="csv">CSV</option>
                    </select>
                </label>
                <label className="block">
                    <span className={label}>{t('reports.schedule.recipients')}</span>
                    <input value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="direction@exemple.com" className={input} />
                </label>
                <button type="button" onClick={() => void create()} disabled={!recipients.trim()} className={button('primary', 'md')}>
                    {t('reports.schedule.add')}
                </button>
            </div>
            {schedules.length > 0 && (
                <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                    {schedules.map((s) => (
                        <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                            <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                                <span className="font-semibold text-ink-900 dark:text-ink-50">
                                    {t(`reports.schedule.${s.frequency}`)} · {s.format.toUpperCase()} · {s.agency?.name ?? t('nav.allAgencies')}
                                </span>
                                <span className="block truncate text-xs text-ink-600 dark:text-ink-350">
                                    {s.recipients.join(', ')} · {s.last_sent_at ? t('reports.schedule.lastSent', { date: dateTime(s.last_sent_at) }) : t('reports.schedule.never')}
                                </span>
                            </span>
                            <ChipToggle active={s.is_active} onClick={() => void api.patch(`/report-schedules/${s.id}`, { is_active: !s.is_active }).then(load)}>
                                {s.is_active ? t('reports.schedule.active') : t('reports.schedule.paused')}
                            </ChipToggle>
                            <button type="button" onClick={() => void api.delete(`/report-schedules/${s.id}`).then(load)} className="text-red-700 dark:text-red-300" aria-label={t('common.delete')}>
                                <Trash2 aria-hidden="true" className="h-4 w-4" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </SectionCard>
    );
}

function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export default function KpiPage() {
    const { user, activeAgencyId } = useAuth();
    const { t, lang } = useI18n();
    const { money, date } = useFormat();
    const number = (n: number) => new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', { maximumFractionDigits: 1 }).format(n);
    const percent = (n: number) => `${number(n)}\u00a0%`;

    const [range, setRange] = useState(() => presetRange('month'));
    const [agencyFilter, setAgencyFilter] = useState<number | ''>('');
    const [comparison, setComparison] = useState<'previous' | 'last_year'>('previous');
    const [metric, setMetric] = useState<'revenue' | 'orders' | 'average_basket'>('revenue');
    const [showSchedules, setShowSchedules] = useState(false);
    const { agencies } = useAuth();
    const [data, setData] = useState<KpiData | null>(null);
    const [previous, setPrevious] = useState<KpiData | null>(null);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState<'pdf' | 'excel' | 'csv' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>('day');
    const [revenueSeries, setRevenueSeries] = useState<RevenueSeriesResponse | null>(null);

    function buildQuery(r = range) {
        const params = new URLSearchParams(r);
        const agency = agencyFilter || activeAgencyId;
        if (agency) params.set('agency_id', String(agency));
        return params.toString();
    }

    useEffect(() => {
        if (!range.from || !range.to || range.from > range.to) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        Promise.all([api.get<KpiData>(`/kpi?${buildQuery()}`), api.get<KpiData>(`/kpi?${buildQuery(comparisonRange(range, comparison))}`)])
            .then(([current, before]) => {
                if (cancelled) return;
                setData(current);
                setPrevious(before);
            })
            .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : t('common.error')))
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeAgencyId, agencyFilter, comparison, range.from, range.to]);

    useEffect(() => {
        if (!range.from || !range.to || range.from > range.to) return;
        let cancelled = false;
        const query = buildQuery();
        api.get<RevenueSeriesResponse>(`/kpi/revenue-series?${query}&granularity=${granularity}`)
            .then((res) => !cancelled && setRevenueSeries(res))
            .catch(() => !cancelled && setRevenueSeries(null));
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeAgencyId, agencyFilter, range.from, range.to, granularity]);

    async function exportFile(kind: 'pdf' | 'excel' | 'csv') {
        setExporting(kind);
        setError(null);
        try {
            const blob = await api.blob(`/kpi/export/${kind}?${buildQuery()}`);
            downloadBlob(blob, `kpi-${range.from}-${range.to}.${kind === 'excel' ? 'xlsx' : kind}`);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('kpi.exportError'));
        } finally {
            setExporting(null);
        }
    }

    const activePreset = matchPreset(range);
    const shortcuts = [
        { to: '/cash', icon: CalendarDays, title: t('reports.links.closures'), text: t('reports.links.closuresText'), allowed: hasPermission(user, 'payments.manage') },
        { to: '/hr', icon: UsersRound, title: t('reports.links.hr'), text: t('reports.links.hrText'), allowed: hasPermission(user, 'hr.manage') },
        {
            to: '/invoices/outstanding',
            icon: BadgeAlert,
            title: t('reports.links.unpaid'),
            text: t('reports.links.unpaidText'),
            allowed: hasPermission(user, 'invoices.manage'),
        },
        { to: '/loyalty', icon: Gem, title: t('reports.links.loyalty'), text: t('reports.links.loyaltyText'), allowed: hasPermission(user, 'clients.manage') },
        { to: '/cash', icon: ArrowLeftRight, title: t('reports.links.movements'), text: t('reports.links.movementsText'), allowed: hasPermission(user, 'payments.manage') },
        { to: '/reports/daily', icon: UsersRound, title: t('reports.links.cashiers'), text: t('reports.links.cashiersText'), allowed: hasPermission(user, 'reports.view') },
        { to: '/multi-agences', icon: MapPin, title: t('reports.links.agencies'), text: t('reports.links.agenciesText'), allowed: hasPermission(user, 'reports.view') },
        {
            to: '/reports/daily',
            icon: Receipt,
            title: t('reports.links.daily'),
            text: t('reports.links.dailyText'),
            allowed: hasPermission(user, 'reports.view'),
        },
    ].filter((s) => s.allowed);

    return (
        <div className="space-y-6">
            <PageHeader
                title={t('kpi.title')}
                subtitle={t('kpi.subtitle')}
                icon={ChartNoAxesCombined}
                actions={
                    <>
                        <button type="button" onClick={() => setShowSchedules((v) => !v)} className={button('secondary', 'md', 'h-10')}>
                            <Clock aria-hidden="true" className="h-4 w-4" />
                            {t('reports.schedule.action')}
                        </button>
                        <button type="button" disabled={exporting !== null} onClick={() => void exportFile('csv')} className={button('secondary', 'md', 'h-10')}>
                            {exporting === 'csv' ? <Spinner className="h-4 w-4" /> : <FileText aria-hidden="true" className="h-4 w-4" />}
                            CSV
                        </button>
                        <button type="button" disabled={exporting !== null} onClick={() => void exportFile('pdf')} className={button('secondary', 'md', 'h-10')}>
                            {exporting === 'pdf' ? <Spinner className="h-4 w-4" /> : <FileDown aria-hidden="true" className="h-4 w-4" />}
                            {t('kpi.exportPdf')}
                        </button>
                        <button type="button" disabled={exporting !== null} onClick={() => void exportFile('excel')} className={button('secondary', 'md', 'h-10')}>
                            {exporting === 'excel' ? <Spinner className="h-4 w-4" /> : <FileSpreadsheet aria-hidden="true" className="h-4 w-4" />}
                            {t('kpi.exportExcel')}
                        </button>
                    </>
                }
            />

            {error && <Alert tone="error">{error}</Alert>}

            {showSchedules && <ScheduleCard agencyId={agencyFilter || activeAgencyId || null} />}

            <section aria-labelledby="reports-period-heading" className={cx(cardPadded, 'space-y-4')}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 id="reports-period-heading" className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                        {t('reports.periodTitle')}
                    </h2>
                    <Pill tone="neutral" icon={MapPin}>
                        {data?.scope === 'agency' ? data.agency?.name ?? '—' : t('kpi.scopeConsolidated')}
                    </Pill>
                </div>
                <div className="flex flex-wrap items-end gap-4">
                    <label className="block basis-full sm:basis-auto">
                        <span className={label}>{t('kpi.from')}</span>
                        <input type="date" value={range.from} max={range.to} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className={cx(input, 'sm:w-44')} />
                    </label>
                    <label className="block basis-full sm:basis-auto">
                        <span className={label}>{t('kpi.to')}</span>
                        <input type="date" value={range.to} min={range.from} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className={cx(input, 'sm:w-44')} />
                    </label>
                    {user?.agency_id === null && (
                        <label className="block basis-full sm:basis-auto">
                            <span className={label}>{t('kpi.agency')}</span>
                            <select value={agencyFilter} onChange={(e) => setAgencyFilter(e.target.value ? Number(e.target.value) : '')} className={cx(select, 'sm:w-52')}>
                                <option value="">{agencies.find((a) => a.id === activeAgencyId)?.name ?? t('nav.allAgencies')}</option>
                                {agencies.filter((a) => a.id !== activeAgencyId).map((a) => (
                                    <option key={a.id} value={a.id}>
                                        {a.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                    <label className="block basis-full sm:basis-auto">
                        <span className={label}>{t('reports.comparison')}</span>
                        <select value={comparison} onChange={(e) => setComparison(e.target.value as 'previous' | 'last_year')} className={cx(select, 'sm:w-56')}>
                            <option value="previous">{t('reports.comparison.previous')}</option>
                            <option value="last_year">{t('reports.comparison.lastYear')}</option>
                        </select>
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
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4">
                        <StatCard label={t('kpi.revenue')} value={money(data.revenue)} icon={ChartNoAxesCombined} {...trend(percentChange(data.revenue, previous?.revenue ?? 0), t(comparison === 'previous' ? 'dashboard.vsPrevious' : 'reports.vsLastYear'))} />
                        <StatCard label={t('reports.kpi.sales')} value={data.payments_count} icon={ReceiptText} tone="sky" {...trend(percentChange(data.payments_count, previous?.payments_count ?? 0), t('reports.kpi.basket', { amount: money(data.average_order_value) }))} />
                        <StatCard label={t('reports.kpi.discounts')} value={money(data.discounts_total)} icon={BadgePercent} tone="accent" hint={t('reports.kpi.ofRevenue', { percent: data.revenue > 0 ? number((data.discounts_total / data.revenue) * 100) : 0 })} />
                        <StatCard label={t('reports.kpi.deposits')} value={data.orders_count} icon={Inbox} tone="violet" {...trend(percentChange(data.orders_count, previous?.orders_count ?? 0), t('reports.kpi.pieces', { count: data.pieces_count }))} />
                        <StatCard label={t('reports.kpi.pickups')} value={data.pickups_count} icon={PackageOpen} tone="emerald" hint={t('reports.kpi.ofDeposits', { percent: data.orders_count > 0 ? number((data.pickups_count / data.orders_count) * 100) : 0 })} />
                        <StatCard label={t('reports.kpi.cash')} value={money(data.payments_by_method.espece.amount + data.cash_in - data.cash_out)} icon={Wallet} tone="brand" hint={t('reports.kpi.netEntries', { amount: money(data.cash_in - data.cash_out) })} />
                        <StatCard label={t('reports.kpi.outstanding')} value={money(data.outstanding)} icon={BadgeAlert} tone="rose" />
                        <StatCard label={t('reports.kpi.loyalty')} value={t('reports.kpi.members', { count: data.loyalty_members })} icon={Gem} tone="accent" hint={t('reports.kpi.loyaltyHint', { count: data.loyalty_new_members, percent: number(data.loyalty_revenue_share) })} />
                    </div>

                    {data.by_agency && data.by_agency.length > 0 && (
                        <SectionCard id="reports-agencies" flush title={t('reports.agencies.title')} subtitle={t('reports.agencies.subtitle')}>
                            <div className="relative overflow-x-auto">
                                <table className="w-full min-w-[640px] text-left text-sm">
                                    <thead className="border-y border-ink-200/80 bg-ink-50 text-[11px] font-bold uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-400">
                                        <tr>
                                            <th scope="col" className="px-5 py-2.5 sm:px-6">{t('kpi.agency')}</th>
                                            <th scope="col" className="px-4 py-2.5 text-right">{t('kpi.revenue')}</th>
                                            <th scope="col" className="px-4 py-2.5 text-right">{t('kpi.ordersCount')}</th>
                                            <th scope="col" className="px-4 py-2.5 text-right">{t('kpi.averageOrderValue')}</th>
                                            <th scope="col" className="px-5 py-2.5 sm:px-6">{t('reports.agencies.trend')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                                        {data.by_agency.map((row) => {
                                            const before = previous?.by_agency?.find((p) => p.agency_id === row.agency_id);
                                            const delta = percentChange(row.revenue, before?.revenue ?? 0);
                                            return (
                                                <tr key={row.agency_id}>
                                                    <td className="whitespace-nowrap px-5 py-3 font-semibold text-ink-900 sm:px-6 dark:text-ink-50">{row.agency_name}</td>
                                                    <td className="px-4 py-3 text-right font-display font-bold tabular-nums text-ink-900 dark:text-white">{money(row.revenue)}</td>
                                                    <td className="px-4 py-3 text-right tabular-nums text-ink-700 dark:text-ink-200">{row.orders_count}</td>
                                                    <td className="px-4 py-3 text-right tabular-nums text-ink-700 dark:text-ink-200">{money(row.average_order_value)}</td>
                                                    <td className="px-5 py-3 sm:px-6">
                                                        {delta === null ? <span className="text-ink-500 dark:text-ink-400">—</span> : <DeltaBadge value={delta} />}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </SectionCard>
                    )}

                    <SectionCard
                        id="reports-revenue-series"
                        title={t('reports.revenueSeries.title')}
                        subtitle={t('reports.revenueSeries.subtitle')}
                        headerExtra={
                            <div role="group" aria-label={t('reports.revenueSeries.granularity')} className="flex flex-wrap gap-2">
                                {(['revenue', 'orders', 'average_basket'] as const).map((m) => (
                                    <ChipToggle key={m} active={metric === m} onClick={() => setMetric(m)}>
                                        {t(`reports.metric.${m}`)}
                                    </ChipToggle>
                                ))}
                                <span className="w-px self-stretch bg-ink-200 dark:bg-ink-700" aria-hidden="true" />
                                {(['day', 'week', 'month'] as const).map((g) => (
                                    <ChipToggle key={g} active={granularity === g} onClick={() => setGranularity(g)}>
                                        {t(`reports.revenueSeries.${g}`)}
                                    </ChipToggle>
                                ))}
                            </div>
                        }
                    >
                        {revenueSeries && revenueSeries.series.length > 0 ? (
                            <RevenueBars
                                series={revenueSeries.series.map((p) => ({ date: p.date, revenue: metric === 'revenue' ? p.revenue : metric === 'orders' ? p.orders ?? 0 : p.average_basket ?? 0 }))}
                                money={metric === 'orders' ? (n) => String(n) : money}
                                dateShort={(value) => seriesLabel(value, granularity, lang)}
                            />
                        ) : (
                            <p className="text-sm text-ink-600 dark:text-ink-350">{t('reports.revenueSeries.empty')}</p>
                        )}
                    </SectionCard>

                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                        <SectionCard id="reports-payments" title={t('reports.payments.title')} subtitle={t('reports.payments.subtitle')}>
                            <SegmentedBar
                                money={money}
                                segments={[
                                    { key: 'espece', label: t('payment.cash'), amount: data.payments_by_method.espece.amount, percent: data.payments_by_method.espece.percent, colorClassName: 'bg-emerald-600 dark:bg-emerald-400' },
                                    { key: 'carte', label: t('payment.card'), amount: data.payments_by_method.carte.amount, percent: data.payments_by_method.carte.percent, colorClassName: 'bg-brand-600 dark:bg-brand-400' },
                                    { key: 'flooz', label: t('payment.flooz'), amount: data.payments_by_method.flooz.amount, percent: data.payments_by_method.flooz.percent, colorClassName: 'bg-accent-500 dark:bg-accent-400' },
                                    { key: 'tmoney', label: t('payment.tmoney'), amount: data.payments_by_method.tmoney.amount, percent: data.payments_by_method.tmoney.percent, colorClassName: 'bg-violet-500 dark:bg-violet-400' },
                                ]}
                            />
                        </SectionCard>

                        <SectionCard id="reports-cash" title={t('reports.cash.title')} subtitle={t('reports.cash.subtitle')}>
                            <dl className="space-y-2 text-sm">
                                <div className="flex justify-between gap-3"><dt className="text-ink-600 dark:text-ink-350">{t('reports.cash.cashPayments')}</dt><dd className="font-semibold tabular-nums text-ink-900 dark:text-white">{money(data.payments_by_method.espece.amount)}</dd></div>
                                <div className="flex justify-between gap-3"><dt className="text-ink-600 dark:text-ink-350">{t('reports.cash.in')}</dt><dd className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">+{money(data.cash_in)}</dd></div>
                                <div className="flex justify-between gap-3"><dt className="text-ink-600 dark:text-ink-350">{t('reports.cash.out')}</dt><dd className="font-semibold tabular-nums text-red-700 dark:text-red-300">−{money(data.cash_out)}</dd></div>
                            </dl>
                        </SectionCard>

                        <SectionCard id="reports-loyalty" title={t('reports.loyalty.title')} subtitle={t('reports.loyalty.subtitle')}>
                            <p className="font-display text-3xl font-bold tabular-nums text-ink-900 dark:text-white">{data.loyalty_members}</p>
                            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                                <Metric label={t('reports.loyalty.newMembers')} value={data.loyalty_new_members} />
                                <Metric label={t('reports.loyalty.revenueShare')} value={percent(data.loyalty_revenue_share)} />
                                <Metric label={t('reports.loyalty.pointsIssued')} value={number(data.loyalty.points_issued)} />
                                <Metric label={t('reports.loyalty.pointsConsumed')} value={number(data.loyalty.points_consumed)} />
                            </dl>
                            {data.loyalty.by_tier.length > 0 ? (
                                <ul className="space-y-2 border-t border-ink-200/80 pt-3 dark:border-ink-800">
                                    {data.loyalty.by_tier.map((tier) => (
                                        <li key={tier.id} className="flex items-center justify-between gap-3 text-sm">
                                            <span className="font-medium text-ink-800 dark:text-ink-100">{tier.name}</span>
                                            <span className="tabular-nums text-ink-600 dark:text-ink-350">{t('reports.loyalty.members', { count: tier.count })}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-sm text-ink-600 dark:text-ink-350">{t('reports.loyalty.noTiers')}</p>
                            )}
                        </SectionCard>
                    </div>

                    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                        <SectionCard id="reports-operations" title={t('reports.operations.title')} subtitle={t('reports.operations.subtitle')}>
                            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                                <Metric label={t('kpi.deliveriesCompleted')} value={data.deliveries_completed} />
                                <Metric label={t('kpi.deliveryCompletionRate')} value={percent(data.delivery_completion_rate)} />
                                <Metric label={t('kpi.activeSubscriptions')} value={data.active_subscriptions} />
                                <Metric label={t('kpi.lowStockItems')} value={data.low_stock_items} warn={data.low_stock_items > 0} />
                                <Metric label={t('kpi.stockMovements')} value={data.stock_movements} />
                                <Metric label={t('kpi.hoursWorked')} value={number(data.hours_worked)} />
                                <Metric label={t('kpi.attendancePresent')} value={data.attendance_present} />
                                <Metric label={t('kpi.attendanceRetard')} value={data.attendance_retard} />
                                <Metric label={t('kpi.attendanceAbsent')} value={data.attendance_absent} />
                            </dl>
                            <p className="text-xs text-ink-500 dark:text-ink-400">
                                {t('kpi.from')} {date(data.from)} — {t('kpi.to')} {date(data.to)}
                            </p>
                        </SectionCard>

                        {shortcuts.length > 0 && (
                            <SectionCard id="reports-links" title={t('reports.links.title')} subtitle={t('reports.links.subtitle')}>
                                <ul className="grid gap-2">
                                    {shortcuts.map((s) => (
                                        <li key={s.title} className="min-w-0">
                                            <ReportLink {...s} />
                                        </li>
                                    ))}
                                </ul>
                            </SectionCard>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function Metric({ label: title, value, warn = false }: { label: string; value: string | number; warn?: boolean }) {
    return (
        <div className="min-w-0">
            <dt className="text-xs font-medium text-ink-600 dark:text-ink-350">{title}</dt>
            <dd className={cx('font-display text-lg font-bold tabular-nums', warn ? 'text-red-700 dark:text-red-300' : 'text-ink-900 dark:text-white')}>{value}</dd>
        </div>
    );
}

function ReportLink({ to, icon: Icon, title, text }: { to: string; icon: LucideIcon; title: string; text: string }) {
    return (
        <Link
            to={to}
            className="group flex items-center gap-3 rounded-xl border border-ink-200/80 px-3.5 py-3 transition hover:border-ink-300 hover:bg-ink-50 dark:border-ink-800 dark:hover:border-ink-700 dark:hover:bg-ink-800/50"
        >
            <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-700 dark:text-brand-300" />
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink-900 dark:text-ink-50">{title}</span>
                <span className="block truncate text-xs text-ink-600 dark:text-ink-350">{text}</span>
            </span>
            <ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-400 transition group-hover:text-brand-700 dark:group-hover:text-brand-300" />
        </Link>
    );
}
