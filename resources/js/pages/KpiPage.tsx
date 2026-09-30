import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    ArrowLeftRight,
    ArrowUpRight,
    BadgeAlert,
    BadgePercent,
    CalendarDays,
    ChartNoAxesCombined,
    CircleDollarSign,
    FileDown,
    FileSpreadsheet,
    Gem,
    MapPin,
    ReceiptText,
    UsersRound,
    type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useFormat } from '../lib/format';
import { api, ApiError } from '../lib/api';
import { hasPermission } from '../lib/permissions';
import { matchPreset, presetRange, previousRange, type PeriodPreset } from '../lib/period';
import PageHeader from '../components/ui/PageHeader';
import { Alert, LoadingState, Spinner } from '../components/ui/Feedback';
import { ChipToggle, DeltaBadge, percentChange, trend, SectionCard, StatCard } from '../components/ui/Metrics';
import { Pill } from '../components/ui/StatusBadge';
import { button, cardPadded, cx, input, label } from '../components/ui/styles';
import type { KpiData } from '../types';

/* Écran « Rapports et bilans » (Figma SPARK PRESSING, section 08, node 43:774).
 * Indicateurs et comparatif d'agences issus de GET /kpi (période choisie + période
 * précédente de même durée pour les variations). Les éléments de la maquette qui
 * demandent de nouveaux agrégats (histogramme du CA par jour/semaine/mois, répartition
 * par mode de paiement, synthèse fidélité, planification d'exports) sont omis — voir
 * CLAUDE.md §2. Les indicateurs opérationnels déjà calculés par l'API (stock, livraisons,
 * présence) sont conservés dans une section dédiée. */

const PRESETS: PeriodPreset[] = ['today', '7d', 'month', 'year'];

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
    const [data, setData] = useState<KpiData | null>(null);
    const [previous, setPrevious] = useState<KpiData | null>(null);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);
    const [error, setError] = useState<string | null>(null);

    function buildQuery(r = range) {
        const params = new URLSearchParams(r);
        if (activeAgencyId) params.set('agency_id', String(activeAgencyId));
        return params.toString();
    }

    useEffect(() => {
        if (!range.from || !range.to || range.from > range.to) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        Promise.all([api.get<KpiData>(`/kpi?${buildQuery()}`), api.get<KpiData>(`/kpi?${buildQuery(previousRange(range))}`)])
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
    }, [activeAgencyId, range.from, range.to]);

    async function exportFile(kind: 'pdf' | 'excel') {
        setExporting(kind);
        setError(null);
        try {
            const blob = await api.blob(`/kpi/export/${kind}?${buildQuery()}`);
            downloadBlob(blob, `kpi-${range.from}-${range.to}.${kind === 'pdf' ? 'pdf' : 'xlsx'}`);
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
    ].filter((s) => s.allowed);

    return (
        <div className="space-y-6">
            <PageHeader
                title={t('kpi.title')}
                subtitle={t('kpi.subtitle')}
                icon={ChartNoAxesCombined}
                actions={
                    <>
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
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <StatCard
                            label={t('kpi.revenue')}
                            value={money(data.revenue)}
                            icon={ChartNoAxesCombined}
                            {...trend(percentChange(data.revenue, previous?.revenue ?? 0), t('dashboard.vsPrevious'))}
                        />
                        <StatCard
                            label={t('kpi.ordersCount')}
                            value={data.orders_count}
                            icon={ReceiptText}
                            tone="sky"
                            {...trend(percentChange(data.orders_count, previous?.orders_count ?? 0), t('dashboard.vsPrevious'))}
                        />
                        <StatCard
                            label={t('kpi.expressRate')}
                            value={percent(data.express_rate)}
                            icon={BadgePercent}
                            tone="accent"
                            {...trend(previous && previous.orders_count > 0 ? Math.round((data.express_rate - previous.express_rate) * 10) / 10 : null, t('dashboard.vsPrevious'), { unit: '\u00a0pt' })}
                        />
                        <StatCard
                            label={t('kpi.averageOrderValue')}
                            value={money(data.average_order_value)}
                            icon={CircleDollarSign}
                            tone="violet"
                            {...trend(percentChange(data.average_order_value, previous?.average_order_value ?? 0), t('dashboard.vsPrevious'))}
                        />
                    </div>

                    {data.by_agency && data.by_agency.length > 0 && (
                        <SectionCard id="reports-agencies" flush title={t('reports.agencies.title')} subtitle={t('reports.agencies.subtitle')}>
                            <div className="overflow-x-auto">
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
