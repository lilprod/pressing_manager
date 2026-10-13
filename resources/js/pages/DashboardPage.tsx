import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    AlarmClock,
    Banknote,
    CircleCheck,
    History,
    PackageOpen,
    CloudUpload,
    Download,
    HeartHandshake,
    Inbox,
    LayoutDashboard,
    ListFilter,
    Plus,
    RefreshCw,
    ShieldCheck,
    WashingMachine,
    Wifi,
    WifiOff,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { api, ApiError } from '../lib/api';
import { useFormat } from '../lib/format';
import { hasPermission } from '../lib/permissions';
import { presetRange, previousRange, type PeriodPreset } from '../lib/period';
import { flushPendingOrders } from '../lib/sync';
import { useLastSyncedAt, useOnlineStatus } from '../lib/useOnlineStatus';
import { auditLogLabel } from '../lib/auditLog';
import { useSyncQueue } from '../lib/useSyncQueue';
import PageHeader from '../components/ui/PageHeader';
import { Alert, EmptyState, LoadingState, Spinner } from '../components/ui/Feedback';
import { DeltaBadge, percentChange, trend, ProgressBar, SectionCard, StatCard } from '../components/ui/Metrics';
import StatusBadge, { Pill, TONES, type Tone } from '../components/ui/StatusBadge';
import { button, cx, select } from '../components/ui/styles';
import RevenueLine from '../components/ui/RevenueLine';
import SegmentedBar from '../components/ui/SegmentedBar';
import type { AuditLog, CashPaymentBreakdown, CashSummary, DashboardOverview, KpiData, Order, OrderStatus, Paginated, RevenueSeriesResponse } from '../types';

/* Écran « Vue d'ensemble » (Figma « Dashboard_Staff », audit du 2026-10-13).
 *
 * Tout ce qui est affiché provient d'endpoints réels : /kpi (période courante et
 * précédente), /dashboard/overview (pièces par étape, délais proches, ancienneté des
 * impayés, retraits, clients fidélité), /kpi/revenue-series (courbe), /cash/summary et
 * /cash/payment-breakdown (flux de caisse), /audit-logs (activité récente, repli sur
 * les derniers dépôts sans `audit.view`) et la file hors ligne locale. Omis faute de
 * donnée réelle : étapes Lavage/Repassage séparées (aucun statut correspondant) et
 * opérations hors ligne autres que des dépôts (la file ne couvre que les dépôts). */

const PIPELINE: { status: OrderStatus; icon: typeof Inbox }[] = [
    { status: 'recu', icon: Inbox },
    { status: 'trie', icon: ListFilter },
    { status: 'en_traitement', icon: WashingMachine },
    { status: 'controle_qualite', icon: ShieldCheck },
    { status: 'pret', icon: CircleCheck },
];

const PIPELINE_TONES: Record<string, Tone> = {
    recu: 'sky',
    trie: 'violet',
    en_traitement: 'brand',
    controle_qualite: 'amber',
    pret: 'emerald',
};

const PIPELINE_CARD: Record<string, string> = {
    recu: 'bg-sky-50 dark:bg-sky-400/10',
    trie: 'bg-violet-50 dark:bg-violet-400/10',
    en_traitement: 'bg-brand-50 dark:bg-brand-400/10',
    controle_qualite: 'bg-amber-50 dark:bg-amber-400/10',
    pret: 'bg-emerald-50 dark:bg-emerald-400/10',
};

const PRESETS: PeriodPreset[] = ['today', '7d', '30d', 'month'];

const AGING_KEYS = ['0_30', '31_89', '90_plus'] as const;

export default function DashboardPage() {
    const { t, lang } = useI18n();
    const { money, dateTime, time, dayMonth } = useFormat();
    const { user, activeAgencyId } = useAuth();
    const online = useOnlineStatus();
    const pending = useSyncQueue();
    const lastSyncedAt = useLastSyncedAt();

    const [preset, setPreset] = useState<PeriodPreset>('today');
    const [kpi, setKpi] = useState<KpiData | null>(null);
    const [previous, setPrevious] = useState<KpiData | null>(null);
    const [overview, setOverview] = useState<DashboardOverview | null>(null);
    const [series, setSeries] = useState<RevenueSeriesResponse | null>(null);
    const [activity, setActivity] = useState<AuditLog[] | null>(null);
    const [recent, setRecent] = useState<Order[]>([]);
    const [cash, setCash] = useState<CashSummary | null>(null);
    const [breakdown, setBreakdown] = useState<CashPaymentBreakdown | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [exporting, setExporting] = useState(false);
    const [syncing, setSyncing] = useState(false);

    const agencyForCash = user?.agency_id ?? activeAgencyId;
    const canCash = hasPermission(user, 'payments.manage') && !!agencyForCash;
    const canInvoices = hasPermission(user, 'invoices.manage');
    const canAudit = hasPermission(user, 'audit.view');
    const range = presetRange(preset);
    // La courbe a besoin de plusieurs points : sur « Aujourd'hui », elle montre les 7 derniers jours.
    const seriesRange = preset === 'today' ? presetRange('7d') : range;

    function scopedQuery(params: Record<string, string>) {
        const query = new URLSearchParams(params);
        if (activeAgencyId) query.set('agency_id', String(activeAgencyId));
        return query.toString();
    }

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        const prev = previousRange(range);

        const requests = Promise.all([
            api.get<KpiData>(`/kpi?${scopedQuery(range)}`),
            api.get<KpiData>(`/kpi?${scopedQuery(prev)}`),
            api.get<DashboardOverview>(`/dashboard/overview?${scopedQuery(range)}`),
            api.get<RevenueSeriesResponse>(`/kpi/revenue-series?${scopedQuery({ ...seriesRange, granularity: 'day' })}`).catch(() => null),
            canAudit
                ? api.get<Paginated<AuditLog>>(`/audit-logs?${scopedQuery({ per_page: '5' })}`).then((res) => res.data).catch(() => null)
                : Promise.resolve(null),
            api.get<Paginated<Order>>(`/orders?${scopedQuery({ per_page: '5' })}`),
            canCash ? api.get<CashSummary>(`/cash/summary?agency_id=${agencyForCash}`).catch(() => null) : Promise.resolve(null),
            canCash ? api.get<CashPaymentBreakdown>(`/cash/payment-breakdown?agency_id=${agencyForCash}`).catch(() => null) : Promise.resolve(null),
        ]);

        requests
            .then(([current, before, over, revenue, logs, latest, cashSummary, cashBreakdown]) => {
                if (cancelled) return;
                setKpi(current);
                setPrevious(before);
                setOverview(over);
                setSeries(revenue);
                setActivity(logs);
                setRecent(latest.data);
                setCash(cashSummary);
                setBreakdown(cashBreakdown);
            })
            .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : t('common.error')))
            .finally(() => !cancelled && setLoading(false));

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [preset, activeAgencyId, canCash, canAudit, agencyForCash]);

    async function exportPdf() {
        setExporting(true);
        try {
            const blob = await api.blob(`/kpi/export/pdf?${scopedQuery(range)}`);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `kpi-${range.from}-${range.to}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('kpi.exportError'));
        } finally {
            setExporting(false);
        }
    }

    async function syncNow() {
        setSyncing(true);
        try {
            await flushPendingOrders();
        } finally {
            setSyncing(false);
        }
    }

    const scopeLabel = kpi?.scope === 'agency' ? kpi.agency?.name ?? '—' : t('kpi.scopeConsolidated');
    const pipeline = overview?.pipeline ?? [];
    const pipelineOrders = pipeline.reduce((sum, row) => sum + row.orders, 0);
    const pipelinePieces = pipeline.reduce((sum, row) => sum + row.pieces, 0);
    const byAgency = kpi?.by_agency ?? [];
    const maxAgencyRevenue = Math.max(0, ...byAgency.map((row) => row.revenue));
    const seriesTotal = (series?.series ?? []).reduce((sum, p) => sum + p.revenue, 0);
    const firstName = (user?.name ?? '').trim().split(/\s+/)[0] ?? '';
    const today = new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
    const deadlines = overview?.deadlines;
    const aging = overview?.aging;

    return (
        <div className="space-y-6">
            <PageHeader
                title={t('dashboard.greeting', { name: firstName })}
                subtitle={t('dashboard.greetingSubtitle', { scope: scopeLabel, date: today })}
                icon={LayoutDashboard}
                actions={
                    <>
                        <label className="relative">
                            <span className="sr-only">{t('dashboard.period')}</span>
                            <select value={preset} onChange={(e) => setPreset(e.target.value as PeriodPreset)} className={cx(select, 'h-10 w-auto pr-9 text-sm font-medium')}>
                                {PRESETS.map((p) => (
                                    <option key={p} value={p}>
                                        {t(`period.${p}`)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <button type="button" onClick={() => void exportPdf()} disabled={exporting} className={button('secondary', 'md', 'h-10')}>
                            {exporting ? <Spinner className="h-4 w-4" /> : <Download aria-hidden="true" className="h-4 w-4" />}
                            {t('dashboard.export')}
                        </button>
                        <Link to="/" className={button('primary', 'md', 'h-10')}>
                            <Plus aria-hidden="true" className="h-4 w-4" />
                            {t('dashboard.newDeposit')}
                        </Link>
                    </>
                }
            />

            {error && <Alert tone="error">{error}</Alert>}

            {loading || !kpi || !overview ? (
                <LoadingState />
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4">
                        <StatCard
                            label={t('dashboard.kpi.revenue')}
                            value={money(kpi.revenue)}
                            icon={Banknote}
                            tone="brand"
                            {...trend(percentChange(kpi.revenue, previous?.revenue ?? 0), t('dashboard.vsPrevious'))}
                        />
                        <StatCard
                            label={t('dashboard.kpi.deposits')}
                            value={kpi.orders_count}
                            icon={Inbox}
                            tone="sky"
                            {...trend(
                                percentChange(kpi.orders_count, previous?.orders_count ?? 0),
                                t('dashboard.kpi.piecesReceived', { count: overview.pieces_received }),
                            )}
                        />
                        <StatCard
                            label={t('dashboard.kpi.pickups')}
                            value={overview.pickups.count}
                            icon={PackageOpen}
                            tone="emerald"
                            hint={t('dashboard.kpi.pickupsHint', { count: overview.pickups.ready_orders })}
                        />
                        <StatCard
                            label={t('dashboard.kpi.loyalty')}
                            value={overview.loyalty.members}
                            icon={HeartHandshake}
                            tone="accent"
                            hint={t('dashboard.kpi.loyaltyHint', { count: overview.loyalty.new_this_month })}
                        />
                    </div>

                    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
                        <SectionCard
                            id="dashboard-revenue"
                            title={t('dashboard.revenue.title')}
                            subtitle={t('dashboard.revenue.subtitle', { amount: money(seriesTotal), days: series?.series.length ?? 0 })}
                            action={hasPermission(user, 'reports.view') ? { to: '/kpi', label: t('dashboard.agencies.action') } : undefined}
                        >
                            {series && series.series.length > 0 ? (
                                <RevenueLine series={series.series} money={money} label={(d) => dayMonth(d)} />
                            ) : (
                                <EmptyState compact icon={Banknote} title={t('dashboard.revenue.empty')} />
                            )}
                        </SectionCard>

                        {kpi.scope === 'consolidated' && byAgency.length > 0 ? (
                            <SectionCard
                                id="dashboard-agencies"
                                title={t('dashboard.agencies.title')}
                                subtitle={t('dashboard.agencies.subtitle')}
                                action={hasPermission(user, 'reports.view') ? { to: '/multi-agences', label: t('dashboard.agencies.action') } : undefined}
                            >
                                <ul className="space-y-4">
                                    {[...byAgency].sort((a, b) => b.revenue - a.revenue).slice(0, 5).map((row) => {
                                        const before = previous?.by_agency?.find((p) => p.agency_id === row.agency_id);
                                        return (
                                            <li key={row.agency_id} className="space-y-1.5">
                                                <div className="flex items-center justify-between gap-3 text-sm">
                                                    <span className="truncate font-semibold text-ink-900 dark:text-ink-50">{row.agency_name}</span>
                                                    <span className="shrink-0 font-display font-bold tabular-nums text-ink-900 dark:text-white">{money(row.revenue)}</span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <ProgressBar value={row.revenue} max={maxAgencyRevenue} />
                                                    <DeltaBadge value={percentChange(row.revenue, before?.revenue ?? 0)} />
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </SectionCard>
                        ) : (
                            <SectionCard id="dashboard-recent" title={t('dashboard.recent.title')} subtitle={t('dashboard.recent.subtitle')} action={{ to: '/orders', label: t('dashboard.recent.action') }}>
                                <RecentOrders orders={recent} money={money} dateTime={dateTime} t={t} />
                            </SectionCard>
                        )}
                    </div>

                    <div className={cx('grid grid-cols-1 items-start gap-6', canCash && cash && 'lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]')}>
                        <SectionCard
                            id="dashboard-pipeline"
                            title={t('dashboard.pipeline.title')}
                            subtitle={t('dashboard.pipeline.subtitlePieces', { orders: pipelineOrders, pieces: pipelinePieces })}
                            action={hasPermission(user, 'orders.update_status') ? { to: '/atelier', label: t('dashboard.pipeline.openAtelier') } : { to: '/orders', label: t('dashboard.pipeline.action') }}
                        >
                            <ol className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                                {PIPELINE.map(({ status, icon: Icon }) => {
                                    const row = pipeline.find((r) => r.status === status);
                                    return (
                                        <li key={status} className={cx('rounded-xl p-3.5', PIPELINE_CARD[status])}>
                                            <div className="flex items-center justify-between gap-2">
                                                <span className={cx('flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-inset', TONES[PIPELINE_TONES[status]])}>
                                                    <Icon aria-hidden="true" className="h-4 w-4" />
                                                </span>
                                                <span className="font-display text-2xl font-bold tabular-nums text-ink-900 dark:text-white">{row?.orders ?? 0}</span>
                                            </div>
                                            <p className="mt-3 text-sm font-semibold text-ink-900 dark:text-ink-50">{t(`status.${status}`)}</p>
                                            <p className="text-xs text-ink-600 dark:text-ink-350">{t('dashboard.pipeline.pieces', { count: row?.pieces ?? 0 })}</p>
                                        </li>
                                    );
                                })}
                            </ol>
                            {deadlines && deadlines.approaching_count > 0 && (
                                <div className="flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 p-3 dark:bg-amber-400/10">
                                    <AlarmClock aria-hidden="true" className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
                                    <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                                        <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">{t('dashboard.pipeline.approaching', { count: deadlines.approaching_count })}</p>
                                        <p className="text-xs text-ink-600 dark:text-ink-350">
                                            {t('dashboard.pipeline.approachingHint', { numbers: deadlines.approaching.map((o) => o.order_number).join(', ') })}
                                        </p>
                                    </div>
                                    <Link to={`/orders/${deadlines.approaching[0]?.id ?? ''}`} className="text-sm font-semibold text-amber-800 hover:underline dark:text-amber-300">
                                        {t('dashboard.pipeline.toTreat')}
                                    </Link>
                                </div>
                            )}
                        </SectionCard>

                        {canCash && cash ? (
                            <SectionCard
                                id="dashboard-cash"
                                title={t('dashboard.cash.title')}
                                subtitle={cash.since ? t('cash.summary.since', { date: dateTime(cash.since) }) : t('cash.summary.sinceNever')}
                                action={{ to: '/cash', label: t('dashboard.cash.action') }}
                            >
                                <div>
                                    <p className="text-sm text-ink-600 dark:text-ink-350">{t('cash.summary.expected')}</p>
                                    <p className="font-display text-2xl font-bold tabular-nums text-ink-900 dark:text-white">{money(cash.expected_balance)}</p>
                                </div>
                                <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
                                    <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-400/10">
                                        <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">{t('dashboard.cash.in')}</p>
                                        <p className="font-display font-bold tabular-nums text-ink-900 dark:text-white">+{money(cash.cash_payments_total + cash.manual_in_total)}</p>
                                    </div>
                                    <div className="rounded-xl bg-red-50 p-3 dark:bg-red-400/10">
                                        <p className="text-xs font-medium text-red-800 dark:text-red-300">{t('dashboard.cash.out')}</p>
                                        <p className="font-display font-bold tabular-nums text-ink-900 dark:text-white">−{money(cash.manual_out_total)}</p>
                                    </div>
                                </div>
                                {breakdown && (
                                    <SegmentedBar
                                        money={money}
                                        segments={(['espece', 'mobile_money', 'carte'] as const).map((key) => ({
                                            key,
                                            label: t(`cash.method.${key}`),
                                            amount: breakdown.by_method[key].amount,
                                            percent: breakdown.by_method[key].percent,
                                            colorClassName: key === 'espece' ? 'bg-brand-600' : key === 'mobile_money' ? 'bg-emerald-500' : 'bg-accent-500',
                                        }))}
                                    />
                                )}
                            </SectionCard>
                        ) : null}
                    </div>

                    {canInvoices && aging && (
                        <SectionCard
                            id="dashboard-unpaid"
                            title={t('dashboard.aging.title')}
                            subtitle={t('dashboard.aging.subtitle')}
                            action={{ to: '/invoices/outstanding', label: t('dashboard.unpaid.action') }}
                        >
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="rounded-xl bg-ink-50 p-4 dark:bg-ink-950/40">
                                    <p className="text-xs text-ink-600 dark:text-ink-350">{t('dashboard.aging.total')}</p>
                                    <p className="font-display text-2xl font-bold tabular-nums text-ink-900 dark:text-white">{money(aging.total)}</p>
                                    <p className="text-xs text-ink-600 dark:text-ink-350">{t('dashboard.unpaid.count', { count: aging.count })}</p>
                                </div>
                                <div className="rounded-xl bg-ink-50 p-4 dark:bg-ink-950/40">
                                    <p className="text-xs text-ink-600 dark:text-ink-350">{t('dashboard.aging.overdue')}</p>
                                    <p className="font-display text-2xl font-bold tabular-nums text-ink-900 dark:text-white">{deadlines?.overdue_count ?? 0}</p>
                                    <p className="text-xs text-ink-600 dark:text-ink-350">{t('dashboard.aging.dueToday', { count: deadlines?.due_today_count ?? 0 })}</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                {AGING_KEYS.map((key) => (
                                    <div key={key} className="rounded-xl border border-ink-200/80 p-4 dark:border-ink-800">
                                        <p className="text-xs text-ink-600 dark:text-ink-350">{t(`dashboard.aging.bucket.${key}`)}</p>
                                        <p className="font-display text-lg font-bold tabular-nums text-ink-900 dark:text-white">{money(aging.buckets[key].amount)}</p>
                                        <p className="text-xs text-ink-600 dark:text-ink-350">{t('dashboard.unpaid.count', { count: aging.buckets[key].count })}</p>
                                    </div>
                                ))}
                            </div>
                        </SectionCard>
                    )}

                    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
                        {activity ? (
                            <SectionCard id="dashboard-activity" title={t('dashboard.activity.title')} subtitle={t('dashboard.activity.subtitle')} action={{ to: '/audit-logs', label: t('dashboard.activity.action') }}>
                                {activity.length === 0 ? (
                                    <EmptyState compact icon={History} title={t('dashboard.activity.empty')} />
                                ) : (
                                    <ul className="-mx-2 divide-y divide-ink-100 dark:divide-ink-800">
                                        {activity.map((log) => (
                                            <li key={log.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-3 sm:flex-nowrap">
                                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200">
                                                    <History aria-hidden="true" className="h-4 w-4" />
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-semibold text-ink-900 dark:text-ink-50">{auditLogLabel(log, t, money)}</p>
                                                    <p className="text-xs text-ink-600 dark:text-ink-350">{log.user?.name ?? t('order.audit.systemActor')}</p>
                                                </div>
                                                <span className="shrink-0 text-xs tabular-nums text-ink-600 dark:text-ink-350">{dateTime(log.created_at)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </SectionCard>
                        ) : (
                            <SectionCard id="dashboard-recent-orders" title={t('dashboard.recent.title')} subtitle={t('dashboard.recent.subtitle')} action={{ to: '/orders', label: t('dashboard.recent.action') }}>
                                <RecentOrders orders={recent} money={money} dateTime={dateTime} t={t} />
                            </SectionCard>
                        )}

                        <SectionCard id="dashboard-sync" title={t('dashboard.sync.title')} subtitle={t('dashboard.sync.subtitle')}>
                            <div className="flex items-center gap-3 rounded-xl border border-ink-200/80 p-3 dark:border-ink-800">
                                <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset', TONES[online ? 'emerald' : 'amber'])}>
                                    {online ? <Wifi aria-hidden="true" className="h-5 w-5" /> : <WifiOff aria-hidden="true" className="h-5 w-5" />}
                                </span>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">{online ? t('login.online') : t('login.offline')}</p>
                                    <p className="text-xs text-ink-600 dark:text-ink-350">
                                        {lastSyncedAt ? t('dashboard.sync.lastSynced', { time: time(lastSyncedAt) }) : online ? t('dashboard.sync.onlineHint') : t('dashboard.sync.offlineHint')}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">{t('dashboard.sync.pending')}</p>
                                    <Pill tone={pending.length > 0 ? 'amber' : 'emerald'}>{t('dashboard.sync.pendingCount', { count: pending.length })}</Pill>
                                </div>
                                {pending.slice(0, 3).map((p) => (
                                    <div key={p.client_local_uuid} className="flex items-center gap-2.5 text-sm">
                                        <CloudUpload aria-hidden="true" className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
                                        <span className="min-w-0 flex-1 truncate text-ink-800 dark:text-ink-100">{p.preview.client_label}</span>
                                        <span className="shrink-0 tabular-nums text-ink-600 dark:text-ink-350">{money(p.preview.total_amount)}</span>
                                    </div>
                                ))}
                            </div>

                            <button type="button" onClick={() => void syncNow()} disabled={!online || pending.length === 0 || syncing} className={button('secondary', 'sm', 'self-start')}>
                                {syncing ? <Spinner className="h-4 w-4" /> : <RefreshCw aria-hidden="true" className="h-4 w-4" />}
                                {t('dashboard.sync.action')}
                            </button>
                        </SectionCard>
                    </div>
                </>
            )}
        </div>
    );
}

function RecentOrders({
    orders,
    money,
    dateTime,
    t,
}: {
    orders: Order[];
    money: (n: number) => string;
    dateTime: (v: string) => string;
    t: (key: string, vars?: Record<string, string | number>) => string;
}) {
    if (orders.length === 0) return <EmptyState compact icon={Inbox} title={t('order.noOrders')} />;

    return (
        <ul className="-mx-2 divide-y divide-ink-100 dark:divide-ink-800">
            {orders.map((order) => (
                <li key={order.id}>
                    <Link
                        to={`/orders/${order.id}`}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-2 py-3 transition hover:bg-ink-50 sm:flex-nowrap dark:hover:bg-ink-800/50"
                    >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200">
                            <Inbox aria-hidden="true" className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-ink-900 dark:text-ink-50">
                                {t('order.number')}
                                {order.order_number} · {order.client?.first_name} {order.client?.last_name}
                            </p>
                            <p className="text-xs text-ink-600 dark:text-ink-350">{dateTime(order.created_at)}</p>
                        </div>
                        <StatusBadge kind="order" status={order.status} />
                        <span className="w-full text-right font-display text-sm font-bold tabular-nums text-ink-900 sm:w-28 dark:text-white">{money(order.total_amount)}</span>
                    </Link>
                </li>
            ))}
        </ul>
    );
}
