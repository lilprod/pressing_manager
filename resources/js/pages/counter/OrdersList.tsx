import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Banknote,
    CalendarClock,
    ChevronRight,
    ClipboardList,
    Clock,
    CloudUpload,
    Download,
    PackageCheck,
    Package,
    PiggyBank,
    Search,
    X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { api } from '../../lib/api';
import { elapsedLabel, useFormat } from '../../lib/format';
import { useSyncQueue } from '../../lib/useSyncQueue';
import PageHeader, { Avatar } from '../../components/ui/PageHeader';
import StatusBadge, { Pill } from '../../components/ui/StatusBadge';
import { EmptyState, LoadingState } from '../../components/ui/Feedback';
import { StatCard } from '../../components/ui/Metrics';
import Pagination from '../../components/ui/Pagination';
import { button, card, cx, input, label as labelClass, textLink } from '../../components/ui/styles';
import type { Order, OrderStats, OrderStatus, Paginated } from '../../types';

const STATUSES: OrderStatus[] = ['recu', 'trie', 'en_traitement', 'controle_qualite', 'pret', 'livre', 'annule'];
const INVOICE_STATUSES = ['non_facture', 'emise', 'partiellement_payee', 'payee', 'annulee'] as const;
type InvoiceStatusFilter = (typeof INVOICE_STATUSES)[number];
type Period = '' | 'today' | 'week' | 'month';

export default function OrdersList() {
    const { t } = useI18n();
    const { money, dateTime } = useFormat();
    const { activeAgencyId } = useAuth();
    const pending = useSyncQueue();
    const [orders, setOrders] = useState<Order[]>([]);
    const [stats, setStats] = useState<OrderStats | null>(null);
    const [meta, setMeta] = useState<Pick<Paginated<Order>, 'current_page' | 'last_page' | 'total'>>({
        current_page: 1,
        last_page: 1,
        total: 0,
    });
    const [page, setPage] = useState(1);
    const [status, setStatus] = useState<OrderStatus | ''>('');
    const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatusFilter | ''>('');
    const [period, setPeriod] = useState<Period>('');
    const [readyToday, setReadyToday] = useState(false);
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
    const [, forceTick] = useState(0);

    // Débounce de la recherche (même délai que la recherche client du comptoir).
    useEffect(() => {
        const timeout = setTimeout(() => setSearch(searchInput.trim()), 300);
        return () => clearTimeout(timeout);
    }, [searchInput]);

    useEffect(() => {
        setLoading(true);
        // Pour un rôle global, l'agence choisie dans l'en-tête filtre la liste (vide = toutes les agences).
        const params = new URLSearchParams({ page: String(page) });
        if (status) params.set('status', status);
        if (invoiceStatus) params.set('invoice_status', invoiceStatus);
        if (period) params.set('period', period);
        if (readyToday) params.set('ready_today', '1');
        if (search) params.set('search', search);
        if (activeAgencyId) params.set('agency_id', String(activeAgencyId));
        api
            .get<Paginated<Order>>(`/orders?${params}`)
            .then((res) => {
                setOrders(res.data);
                setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
                setLastFetchedAt(new Date());
            })
            .catch(() => setOrders([]))
            .finally(() => setLoading(false));
    }, [status, invoiceStatus, period, readyToday, search, activeAgencyId, page]);

    useEffect(() => {
        const params = new URLSearchParams();
        if (activeAgencyId) params.set('agency_id', String(activeAgencyId));
        api
            .get<OrderStats>(`/orders/stats?${params}`)
            .then(setStats)
            .catch(() => setStats(null));
    }, [activeAgencyId]);

    // Rafraîchit l'indicateur « il y a … » sans refaire d'appel réseau.
    useEffect(() => {
        const interval = setInterval(() => forceTick((n) => n + 1), 15_000);
        return () => clearInterval(interval);
    }, []);

    function toggleReadyToday() {
        setReadyToday((current) => !current);
        setPage(1);
    }

    function clearFilters() {
        setSearchInput('');
        setSearch('');
        setStatus('');
        setInvoiceStatus('');
        setPeriod('');
        setReadyToday(false);
        setPage(1);
    }

    const hasActiveFilters = search !== '' || status !== '' || invoiceStatus !== '' || period !== '' || readyToday;

    useEffect(() => setPage(1), [activeAgencyId]);

    async function exportOrders() {
        const params = new URLSearchParams();
        if (status) params.set('status', status);
        if (invoiceStatus) params.set('invoice_status', invoiceStatus);
        if (period) params.set('period', period);
        if (readyToday) params.set('ready_today', '1');
        if (search) params.set('search', search);
        if (activeAgencyId) params.set('agency_id', String(activeAgencyId));
        const blob = await api.blob(`/orders/export?${params}`);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `depots-${new Date().toISOString().slice(0, 10)}.xlsx`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }

    function articlesLabel(order: Order): string {
        const parts: string[] = [];
        if (order.pieces_count) parts.push(t('order.itemsCount', { count: order.pieces_count }));
        if (order.weight_kg_total) parts.push(t('order.weightKg', { weight: order.weight_kg_total }));
        return parts.length > 0 ? parts.join(' · ') : '—';
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={t('nav.orders')}
                subtitle={t('order.listSubtitle')}
                icon={ClipboardList}
                actions={
                    <Link to="/" className={button('primary')}>
                        {t('nav.newOrder')}
                    </Link>
                }
            />

            {stats && (
                <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:grid-cols-4">
                    <StatCard label={t('order.stats.today')} value={stats.today_count} icon={PackageCheck} tone="brand" />
                    <StatCard label={t('order.stats.todayRevenue')} value={money(stats.today_revenue)} icon={Banknote} tone="emerald" />
                    <StatCard label={t('order.stats.dueToday')} value={stats.due_today} icon={CalendarClock} tone="sky" />
                    <StatCard label={t('order.stats.outstanding')} value={money(stats.outstanding_balance)} icon={PiggyBank} tone="amber" />
                </div>
            )}

            <section className={cx(card, 'space-y-4 p-5')}>
                <label className="block">
                    <span className={labelClass}>{t('order.search')}</span>
                    <div className="relative">
                        <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                        <input
                            type="search"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder={t('order.searchPlaceholder')}
                            className={cx(input, 'pl-10')}
                        />
                    </div>
                </label>

                <div className="flex flex-wrap items-end gap-3">
                    <label className="block">
                        <span className={labelClass}>{t('order.filters.period')}</span>
                        <select value={period} onChange={(e) => setPeriod(e.target.value as Period)} className={cx(input, 'sm:w-44')}>
                            <option value="">{t('order.filters.periodAll')}</option>
                            <option value="today">{t('order.filters.periodToday')}</option>
                            <option value="week">{t('order.filters.periodWeek')}</option>
                            <option value="month">{t('order.filters.periodMonth')}</option>
                        </select>
                    </label>

                    <label className="block">
                        <span className={labelClass}>{t('order.commercialStatus.title')}</span>
                        <select value={invoiceStatus} onChange={(e) => setInvoiceStatus(e.target.value as InvoiceStatusFilter | '')} className={cx(input, 'sm:w-48')}>
                            <option value="">{t('order.all')}</option>
                            {INVOICE_STATUSES.map((value) => (
                                <option key={value} value={value}>
                                    {value === 'non_facture' ? t('order.commercialStatus.notInvoiced') : t(`invoice.status.${value}`)}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="block">
                        <span className={labelClass}>{t('order.workshopStatus.title')}</span>
                        <select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus | '')} className={cx(input, 'sm:w-48')}>
                            <option value="">{t('order.all')}</option>
                            {STATUSES.map((s) => (
                                <option key={s} value={s}>
                                    {t(`status.${s}`)}
                                </option>
                            ))}
                        </select>
                    </label>

                    <button
                        type="button"
                        aria-pressed={readyToday}
                        onClick={toggleReadyToday}
                        className={cx(
                            'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition duration-150 active:scale-95',
                            readyToday
                                ? 'bg-ink-900 text-white shadow-sm dark:bg-white dark:text-ink-950'
                                : 'bg-white text-ink-700 ring-1 ring-inset ring-ink-200 hover:bg-ink-50 hover:ring-ink-300 dark:bg-ink-900 dark:text-ink-200 dark:ring-ink-700 dark:hover:bg-ink-800',
                        )}
                    >
                        <Clock aria-hidden="true" className="h-4 w-4" />
                        {t('order.readyToday')}
                    </button>

                    {hasActiveFilters && (
                        <button type="button" onClick={clearFilters} className={cx(textLink, 'inline-flex items-center gap-1 text-sm')}>
                            <X aria-hidden="true" className="h-4 w-4" />
                            {t('order.filters.clear')}
                        </button>
                    )}
                </div>
            </section>

            {pending.length > 0 && (
                <section aria-labelledby="pending-heading" className="space-y-2.5">
                    <h2 id="pending-heading" className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
                        <CloudUpload aria-hidden="true" className="h-4 w-4" />
                        {t('order.pending')}
                    </h2>
                    <ul aria-label={t('order.pending')} className="space-y-2">
                        {pending.map((p) => (
                            <li
                                key={p.client_local_uuid}
                                className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-400/30 dark:bg-amber-400/5"
                            >
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
                                    <CloudUpload aria-hidden="true" className="h-[18px] w-[18px]" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-ink-900 dark:text-ink-50">{p.preview.client_label}</p>
                                    <p className="text-ink-700 dark:text-ink-300">
                                        {p.preview.items_count} {t('order.items').toLowerCase()} · {money(p.preview.total_amount)}
                                    </p>
                                    {p.status === 'error' && <p className="mt-1 font-medium text-red-700 dark:text-red-300">{p.error}</p>}
                                </div>
                                <Pill tone="amber">{t('order.pending')}</Pill>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <div className={cx(card, 'overflow-hidden')}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200/80 px-5 py-3.5 dark:border-ink-800">
                    <div>
                        <h2 className="text-sm font-bold text-ink-900 dark:text-white">{t('order.recent')}</h2>
                        <p className="text-xs text-ink-600 dark:text-ink-350">
                            {t('order.resultsCount', { count: meta.total })}
                            {lastFetchedAt && ` · ${t('order.lastRefresh', { elapsed: elapsedLabel(lastFetchedAt.toISOString()) })}`}
                        </p>
                    </div>
                    <button type="button" onClick={() => void exportOrders()} className={button('secondary', 'sm')}>
                        <Download aria-hidden="true" className="h-4 w-4" />
                        {t('order.export')}
                    </button>
                </div>

                {loading ? (
                    <LoadingState />
                ) : orders.length === 0 ? (
                    <EmptyState icon={Package} title={t('order.noOrders')} description={t('order.noOrdersHint')} />
                ) : (
                    <div className="overflow-x-auto">
                        <div className="min-w-[1280px]">
                            <div
                                role="row"
                                className="flex items-center gap-4 border-b border-ink-200/80 bg-ink-50 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-400"
                            >
                                <span className="w-8 shrink-0" aria-hidden="true" />
                                <span className="w-28 shrink-0">{t('order.table.code')}</span>
                                <span className="min-w-[160px] flex-1">{t('order.client')}</span>
                                <span className="w-24 shrink-0">{t('order.table.service')}</span>
                                <span className="w-28 shrink-0">{t('order.items')}</span>
                                <span className="w-24 shrink-0 text-right">{t('common.total')}</span>
                                <span className="w-24 shrink-0 text-right">{t('order.table.paid')}</span>
                                <span className="w-24 shrink-0 text-right">{t('order.table.remaining')}</span>
                                <span className="w-32 shrink-0">{t('order.table.status')}</span>
                                <span className="w-36 shrink-0">{t('order.table.promised')}</span>
                                <span className="w-5 shrink-0" aria-hidden="true" />
                            </div>

                            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                                {orders.map((order) => (
                                    <li key={order.id}>
                                        <Link
                                            to={`/orders/${order.id}`}
                                            className="group flex items-center gap-4 px-5 py-3 transition hover:bg-ink-50 focus-visible:bg-ink-50 dark:hover:bg-ink-800/50 dark:focus-visible:bg-ink-800/50"
                                        >
                                            <Avatar firstName={order.client?.first_name} lastName={order.client?.last_name} size="sm" className="shrink-0" />

                                            <div className="w-28 shrink-0">
                                                <p className="font-display font-bold text-ink-900 dark:text-white">
                                                    {t('order.number')}
                                                    {order.order_number}
                                                </p>
                                                <p className="text-xs text-ink-500 dark:text-ink-400">{dateTime(order.created_at)}</p>
                                            </div>

                                            <div className="min-w-[160px] flex-1">
                                                <p className="truncate font-medium text-ink-900 dark:text-white">
                                                    {order.client?.first_name} {order.client?.last_name}
                                                </p>
                                                {order.client?.phone && <p className="truncate text-xs text-ink-500 dark:text-ink-400">{order.client.phone}</p>}
                                            </div>

                                            <div className="w-24 shrink-0">
                                                {order.treatment_name ? (
                                                    <Pill tone={order.is_express ? 'accent' : 'neutral'}>{order.treatment_name}</Pill>
                                                ) : order.is_express ? (
                                                    <Pill tone="accent">{t('order.expressShort')}</Pill>
                                                ) : (
                                                    <Pill tone="neutral">{t('order.standard')}</Pill>
                                                )}
                                            </div>

                                            <p className="w-28 shrink-0 text-sm text-ink-700 dark:text-ink-200">{articlesLabel(order)}</p>

                                            <span className="w-24 shrink-0 text-right font-display font-bold tabular-nums text-ink-900 dark:text-white">
                                                {money(order.total_amount)}
                                            </span>

                                            <span className="w-24 shrink-0 text-right text-sm tabular-nums text-ink-600 dark:text-ink-350">
                                                {order.paid_amount != null ? money(order.paid_amount) : '—'}
                                            </span>

                                            <span
                                                className={cx(
                                                    'w-24 shrink-0 text-right text-sm font-semibold tabular-nums',
                                                    order.balance_due ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300',
                                                )}
                                            >
                                                {order.balance_due != null ? money(order.balance_due) : '—'}
                                            </span>

                                            <div className="w-32 shrink-0">
                                                <StatusBadge kind="order" status={order.status} />
                                            </div>

                                            <p className="w-36 shrink-0 text-sm text-ink-600 dark:text-ink-350">{order.promised_at ? dateTime(order.promised_at) : '—'}</p>

                                            <ChevronRight
                                                aria-hidden="true"
                                                className="h-5 w-5 shrink-0 text-ink-400 transition group-hover:translate-x-0.5 group-hover:text-brand-700 dark:group-hover:text-brand-300"
                                            />
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}
                <Pagination meta={meta} onPageChange={setPage} />
            </div>
        </div>
    );
}
