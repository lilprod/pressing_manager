import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Banknote,
    CircleCheck,
    CloudUpload,
    Download,
    HeartHandshake,
    Inbox,
    LayoutDashboard,
    ListFilter,
    PackageCheck,
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
import { useOnlineStatus } from '../lib/useOnlineStatus';
import { useSyncQueue } from '../lib/useSyncQueue';
import PageHeader from '../components/ui/PageHeader';
import { Alert, EmptyState, LoadingState, Spinner } from '../components/ui/Feedback';
import { DeltaBadge, percentChange, trend, ProgressBar, SectionCard, StatCard } from '../components/ui/Metrics';
import StatusBadge, { Pill, TONES, type Tone } from '../components/ui/StatusBadge';
import { button, cx, select } from '../components/ui/styles';
import type { CashSummary, KpiData, Order, OrderStatus, Paginated } from '../types';

/* Écran « Vue d'ensemble » (Figma SPARK PRESSING, section 00, node 1:13).
 *
 * Tout ce qui est affiché provient d'endpoints existants : /kpi (période courante et
 * période précédente de même durée pour les variations), /orders (compteurs par statut
 * via le total paginé, derniers dépôts), /cash/summary, /invoices (total impayé) et la
 * file hors ligne locale (IndexedDB). Les blocs de la maquette qui demanderaient un
 * nouvel agrégat backend (courbe des revenus, répartition par mode de paiement, alerte
 * de retard, ancienneté des impayés, journal d'activité multi-évènements) sont omis —
 * voir CLAUDE.md §2. */

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

const PRESETS: PeriodPreset[] = ['today', '7d', '30d', 'month'];

type Pipeline = Partial<Record<OrderStatus, number>>;

export default function DashboardPage() {
    const { t } = useI18n();
    const { money, dateTime } = useFormat();
    const { user, activeAgencyId } = useAuth();
    const online = useOnlineStatus();
    const pending = useSyncQueue();

    const [preset, setPreset] = useState<PeriodPreset>('7d');
    const [kpi, setKpi] = useState<KpiData | null>(null);
    const [previous, setPrevious] = useState<KpiData | null>(null);
    const [pipeline, setPipeline] = useState<Pipeline>({});
    const [recent, setRecent] = useState<Order[]>([]);
    const [cash, setCash] = useState<CashSummary | null>(null);
    const [outstanding, setOutstanding] = useState<{ amount: number; count: number } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [exporting, setExporting] = useState(false);
    const [syncing, setSyncing] = useState(false);

    const agencyForCash = user?.agency_id ?? activeAgencyId;
    const canCash = hasPermission(user, 'payments.manage') && !!agencyForCash;
    const canInvoices = hasPermission(user, 'invoices.manage');
    const range = presetRange(preset);

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
            Promise.all(
                PIPELINE.map(({ status }) =>
                    api.get<Paginated<Order>>(`/orders?${scopedQuery({ status, per_page: '1' })}`).then((res) => [status, res.total] as const),
                ),
            ),
            api.get<Paginated<Order>>(`/orders?${scopedQuery({ per_page: '5' })}`),
            canCash ? api.get<CashSummary>(`/cash/summary?agency_id=${agencyForCash}`).catch(() => null) : Promise.resolve(null),
            canInvoices
                ? api
                      .get<Paginated<unknown> & { total_outstanding: number }>(`/invoices?${scopedQuery({ per_page: '1' })}`)
                      .then((res) => ({ amount: res.total_outstanding, count: res.total }))
                      .catch(() => null)
                : Promise.resolve(null),
        ]);

        requests
            .then(([current, before, counts, latest, cashSummary, unpaid]) => {
                if (cancelled) return;
                setKpi(current);
                setPrevious(before);
                setPipeline(Object.fromEntries(counts));
                setRecent(latest.data);
                setCash(cashSummary);
                setOutstanding(unpaid);
            })
            .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : t('common.error')))
            .finally(() => !cancelled && setLoading(false));

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [preset, activeAgencyId, canCash, canInvoices, agencyForCash]);

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
    const pipelineTotal = PIPELINE.reduce((sum, { status }) => sum + (pipeline[status] ?? 0), 0);
    const byAgency = kpi?.by_agency ?? [];
    const maxAgencyRevenue = Math.max(0, ...byAgency.map((row) => row.revenue));

    return (
        <div className="space-y-6">
            <PageHeader
                title={t('dashboard.title')}
                subtitle={t('dashboard.subtitle', { scope: scopeLabel })}
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

            {loading || !kpi ? (
                <LoadingState />
            ) : (
                <>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
                            {...trend(percentChange(kpi.orders_count, previous?.orders_count ?? 0), t('dashboard.vsPrevious'))}
                        />
                        <StatCard
                            label={t('dashboard.kpi.ready')}
                            value={pipeline.pret ?? 0}
                            icon={PackageCheck}
                            tone="emerald"
                            hint={t('dashboard.kpi.readyHint')}
                        />
                        <StatCard
                            label={t('dashboard.kpi.subscriptions')}
                            value={kpi.active_subscriptions}
                            icon={HeartHandshake}
                            tone="accent"
                            hint={t('dashboard.kpi.subscriptionsHint')}
                        />
                    </div>

                    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
                        <div className="min-w-0 space-y-6">
                            <SectionCard
                                id="dashboard-pipeline"
                                title={t('dashboard.pipeline.title')}
                                subtitle={t('dashboard.pipeline.subtitle', { count: pipelineTotal })}
                                action={{ to: '/orders', label: t('dashboard.pipeline.action') }}
                            >
                                <ol className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                                    {PIPELINE.map(({ status, icon: Icon }) => (
                                        <li key={status} className="rounded-xl border border-ink-200/80 bg-ink-50/60 p-3.5 dark:border-ink-800 dark:bg-ink-950/40">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className={cx('flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-inset', TONES[PIPELINE_TONES[status]])}>
                                                    <Icon aria-hidden="true" className="h-4 w-4" />
                                                </span>
                                                <span className="font-display text-2xl font-bold tabular-nums text-ink-900 dark:text-white">{pipeline[status] ?? 0}</span>
                                            </div>
                                            <p className="mt-3 text-sm font-semibold text-ink-900 dark:text-ink-50">{t(`status.${status}`)}</p>
                                            <p className="text-xs text-ink-600 dark:text-ink-350">{t('dashboard.pipeline.orders')}</p>
                                        </li>
                                    ))}
                                </ol>
                            </SectionCard>

                            <SectionCard
                                id="dashboard-recent"
                                title={t('dashboard.recent.title')}
                                subtitle={t('dashboard.recent.subtitle')}
                                action={{ to: '/orders', label: t('dashboard.recent.action') }}
                            >
                                {recent.length === 0 ? (
                                    <EmptyState compact icon={Inbox} title={t('order.noOrders')} />
                                ) : (
                                    <ul className="-mx-2 divide-y divide-ink-100 dark:divide-ink-800">
                                        {recent.map((order) => (
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
                                                    <span className="w-full text-right font-display text-sm font-bold tabular-nums text-ink-900 sm:w-28 dark:text-white">
                                                        {money(order.total_amount)}
                                                    </span>
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </SectionCard>
                        </div>

                        <div className="min-w-0 space-y-6">
                            {kpi.scope === 'consolidated' && byAgency.length > 0 && (
                                <SectionCard
                                    id="dashboard-agencies"
                                    title={t('dashboard.agencies.title')}
                                    subtitle={t('dashboard.agencies.subtitle')}
                                    action={hasPermission(user, 'reports.view') ? { to: '/kpi', label: t('dashboard.agencies.action') } : undefined}
                                >
                                    <ul className="space-y-4">
                                        {byAgency.map((row) => {
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
                            )}

                            {canCash && cash && (
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
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-400/10">
                                            <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">{t('dashboard.cash.in')}</p>
                                            <p className="font-display font-bold tabular-nums text-ink-900 dark:text-white">
                                                {money(cash.cash_payments_total + cash.manual_in_total)}
                                            </p>
                                        </div>
                                        <div className="rounded-xl bg-red-50 p-3 dark:bg-red-400/10">
                                            <p className="text-xs font-medium text-red-800 dark:text-red-300">{t('dashboard.cash.out')}</p>
                                            <p className="font-display font-bold tabular-nums text-ink-900 dark:text-white">{money(cash.manual_out_total)}</p>
                                        </div>
                                    </div>
                                </SectionCard>
                            )}

                            {canInvoices && outstanding && (
                                <SectionCard
                                    id="dashboard-unpaid"
                                    title={t('dashboard.unpaid.title')}
                                    subtitle={t('dashboard.unpaid.subtitle')}
                                    action={{ to: '/invoices/outstanding', label: t('dashboard.unpaid.action') }}
                                >
                                    <div className="flex flex-wrap items-end justify-between gap-3">
                                        <div>
                                            <p className="text-sm text-ink-600 dark:text-ink-350">{t('invoice.totalOutstanding')}</p>
                                            <p className="font-display text-2xl font-bold tabular-nums text-ink-900 dark:text-white">{money(outstanding.amount)}</p>
                                        </div>
                                        <Pill tone={outstanding.count > 0 ? 'amber' : 'emerald'}>{t('dashboard.unpaid.count', { count: outstanding.count })}</Pill>
                                    </div>
                                </SectionCard>
                            )}

                            <SectionCard id="dashboard-sync" title={t('dashboard.sync.title')} subtitle={t('dashboard.sync.subtitle')}>
                                <div className="flex items-center gap-3 rounded-xl border border-ink-200/80 p-3 dark:border-ink-800">
                                    <span
                                        className={cx(
                                            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset',
                                            TONES[online ? 'emerald' : 'amber'],
                                        )}
                                    >
                                        {online ? <Wifi aria-hidden="true" className="h-5 w-5" /> : <WifiOff aria-hidden="true" className="h-5 w-5" />}
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">{online ? t('login.online') : t('login.offline')}</p>
                                        <p className="text-xs text-ink-600 dark:text-ink-350">{online ? t('dashboard.sync.onlineHint') : t('dashboard.sync.offlineHint')}</p>
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

                                <button
                                    type="button"
                                    onClick={() => void syncNow()}
                                    disabled={!online || pending.length === 0 || syncing}
                                    className={button('secondary', 'sm', 'self-start')}
                                >
                                    {syncing ? <Spinner className="h-4 w-4" /> : <RefreshCw aria-hidden="true" className="h-4 w-4" />}
                                    {t('dashboard.sync.action')}
                                </button>
                            </SectionCard>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
