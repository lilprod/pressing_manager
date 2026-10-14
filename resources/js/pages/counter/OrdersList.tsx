import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
    Banknote,
    CalendarClock,
    Columns3,
    ClipboardList,
    Clock,
    Download,
    MoreVertical,
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
import PageHeader from '../../components/ui/PageHeader';
import StatusBadge, { Pill } from '../../components/ui/StatusBadge';
import { EmptyState, LoadingState } from '../../components/ui/Feedback';
import { StatCard, percentChange, trend } from '../../components/ui/Metrics';
import Pagination from '../../components/ui/Pagination';
import { button, card, cx, input, label as labelClass, textLink } from '../../components/ui/styles';
import type { Order, OrderStats, OrderStatus, Paginated } from '../../types';

const STATUSES: OrderStatus[] = ['recu', 'trie', 'en_traitement', 'controle_qualite', 'pret', 'livre', 'annule'];
const INVOICE_STATUSES = ['non_facture', 'emise', 'partiellement_payee', 'payee', 'annulee'] as const;
type InvoiceStatusFilter = (typeof INVOICE_STATUSES)[number];
type Period = '' | 'today' | 'week' | 'month';

function displayCodeFor(order: { order_number: number | string; order_number_formatted?: string | null }, prefix: string): string {
    const formatted = order.order_number_formatted;
    if (formatted && /\D/.test(formatted)) return formatted;
    return `${prefix}${formatted ?? order.order_number}`;
}

type OptionalColumn = 'service' | 'items' | 'total' | 'paid' | 'remaining' | 'promised' | 'status' | 'sync';
const OPTIONAL_COLUMNS: OptionalColumn[] = ['service', 'items', 'total', 'paid', 'remaining', 'promised', 'status', 'sync'];
const COLUMNS_KEY = 'pm.ordersList.columns';

function loadVisibleColumns(): OptionalColumn[] {
    try {
        const stored = JSON.parse(localStorage.getItem(COLUMNS_KEY) ?? 'null') as OptionalColumn[] | null;
        if (Array.isArray(stored)) return stored.filter((c) => OPTIONAL_COLUMNS.includes(c));
    } catch {
        /* préférence absente ou illisible : toutes les colonnes */
    }
    return OPTIONAL_COLUMNS;
}

function SyncDot({ tone, label }: { tone: 'emerald' | 'amber' | 'red'; label: string }) {
    const dot = { emerald: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500' }[tone];
    return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-ink-700 dark:text-ink-200">
            <span aria-hidden="true" className={cx('h-2 w-2 rounded-full', dot)} />
            {label}
        </span>
    );
}

function ColumnsMenu({ visible, onToggle }: { visible: OptionalColumn[]; onToggle: (column: OptionalColumn) => void }) {
    const { t } = useI18n();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);
    return (
        <div ref={ref} className="relative">
            <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={button('secondary', 'sm')}>
                <Columns3 aria-hidden="true" className="h-4 w-4" />
                {t('order.columns.title')}
            </button>
            {open && (
                <div className={cx(card, 'absolute right-0 z-20 mt-2 w-56 space-y-1 p-2 shadow-lg')}>
                    {OPTIONAL_COLUMNS.map((column) => (
                        <label key={column} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-ink-50 dark:hover:bg-ink-800">
                            <input type="checkbox" checked={visible.includes(column)} onChange={() => onToggle(column)} className="h-4 w-4 rounded" />
                            {t(`order.columns.${column}`)}
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
}

function RowMenu({ order }: { order: Order }) {
    const { t } = useI18n();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);
    const item = 'block rounded-lg px-3 py-2 text-sm text-ink-800 hover:bg-ink-50 dark:text-ink-100 dark:hover:bg-ink-800';
    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                aria-label={t('common.actions')}
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800"
            >
                <MoreVertical aria-hidden="true" className="h-4 w-4" />
            </button>
            {open && (
                <div className={cx(card, 'absolute right-0 z-20 mt-1 w-52 p-1.5 shadow-lg')}>
                    <Link to={`/orders/${order.id}`} className={item}>
                        {t('order.rowMenu.open')}
                    </Link>
                    <Link to={`/orders/${order.id}/documents`} className={item}>
                        {t('documents.title')}
                    </Link>
                    {order.status === 'pret' && (
                        <Link to={`/pickups/${order.id}`} className={item}>
                            {t('order.actions.pickup')}
                        </Link>
                    )}
                    {['recu', 'trie', 'en_traitement', 'controle_qualite', 'pret'].includes(order.status) && (
                        <Link to={`/atelier?order=${order.id}`} className={item}>
                            {t('order.followWorkshop')}
                        </Link>
                    )}
                </div>
            )}
        </div>
    );
}

export default function OrdersList() {
    const [urlParams] = useSearchParams();
    const clientFilter = urlParams.get('client_id');
    const { t, lang } = useI18n();
    const displayCode = (order: Order) => displayCodeFor(order, 'N° ');
    const { money, dateTime } = useFormat();
    const { activeAgencyId, setActiveAgencyId, agencies, user } = useAuth();
    const isGlobal = user?.agency_id == null;
    const [visibleColumns, setVisibleColumns] = useState<OptionalColumn[]>(loadVisibleColumns);
    const show = (column: OptionalColumn) => visibleColumns.includes(column);
    function toggleColumn(column: OptionalColumn) {
        setVisibleColumns((current) => {
            const next = current.includes(column) ? current.filter((c) => c !== column) : [...current, column];
            try {
                localStorage.setItem(COLUMNS_KEY, JSON.stringify(next));
            } catch {
                /* préférence d'affichage seulement */
            }
            return next;
        });
    }
    const pending = useSyncQueue();
    const [orders, setOrders] = useState<Order[]>([]);
    const [stats, setStats] = useState<OrderStats | null>(null);
    const [meta, setMeta] = useState<Pick<Paginated<Order>, 'current_page' | 'last_page' | 'total' | 'from' | 'to'>>({
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
        if (clientFilter) params.set('client_id', clientFilter);
        if (activeAgencyId) params.set('agency_id', String(activeAgencyId));
        api
            .get<Paginated<Order>>(`/orders?${params}`)
            .then((res) => {
                setOrders(res.data);
                setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total, from: res.from, to: res.to });
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
        if (clientFilter) params.set('client_id', clientFilter);
        if (activeAgencyId) params.set('agency_id', String(activeAgencyId));
        const blob = await api.blob(`/orders/export?${params}`);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `depots-${new Date().toISOString().slice(0, 10)}.xlsx`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }

    const rangeFrom = meta.from ?? 0;
    const rangeTo = meta.to ?? 0;
    // Les dépôts encore dans la file locale de l'appareil apparaissent en tête de la 1re page,
    // avec leur vrai état de synchronisation ; une ligne serveur est par définition « À jour ».
    const localRows = page === 1 && !hasActiveFilters && !clientFilter ? pending : [];
    const weekdayLabel = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'long' }).format(new Date());

    function dayTime(value: string): string {
        const d = new Date(value);
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);
        const hm = d.toLocaleTimeString(lang === 'en' ? 'en-GB' : 'fr-FR', { hour: '2-digit', minute: '2-digit' });
        if (d.toDateString() === today.toDateString()) return t('order.table.todayAt', { time: hm });
        if (d.toDateString() === yesterday.toDateString()) return t('order.table.yesterdayAt', { time: hm });
        return dateTime(value);
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
                    <StatCard
                        label={t('order.stats.today')}
                        value={stats.today_count}
                        icon={PackageCheck}
                        tone="brand"
                        {...trend(percentChange(stats.today_count, stats.same_day_last_week_count), t('order.stats.vsLastWeekDay', { day: weekdayLabel }))}
                    />
                    <StatCard
                        label={t('order.stats.todayRevenue')}
                        value={money(stats.today_deposited_amount)}
                        icon={Banknote}
                        tone="emerald"
                        hint={t('order.stats.collected', { amount: money(stats.today_revenue) })}
                    />
                    <StatCard
                        label={t('order.stats.dueToday')}
                        value={stats.due_today}
                        icon={CalendarClock}
                        tone="sky"
                        hint={t('order.stats.alreadyReady', { count: stats.ready_due_today })}
                    />
                    <StatCard
                        label={t('order.stats.outstanding')}
                        value={money(stats.outstanding_balance)}
                        icon={PiggyBank}
                        tone="amber"
                        hint={t('order.stats.openDeposits', { count: stats.open_invoices_count })}
                    />
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
                    <div className="block min-w-0 max-w-full">
                        <span className={labelClass}>{t('order.filters.period')}</span>
                        <div role="group" aria-label={t('order.filters.period')} className="flex h-11 max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-ink-100 p-1 dark:bg-ink-800">
                            {(
                                [
                                    ['', t('order.filters.periodAll')],
                                    ['today', t('order.filters.periodToday')],
                                    ['week', t('order.filters.periodWeek')],
                                    ['month', t('order.filters.periodMonth')],
                                ] as [Period, string][]
                            ).map(([value, text]) => (
                                <button
                                    key={value || 'all'}
                                    type="button"
                                    aria-pressed={period === value}
                                    onClick={() => setPeriod(value)}
                                    className={cx(
                                        'h-full shrink-0 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition',
                                        period === value ? 'bg-white text-ink-900 shadow-sm dark:bg-ink-700 dark:text-white' : 'text-ink-600 hover:text-ink-900 dark:text-ink-300',
                                    )}
                                >
                                    {text}
                                </button>
                            ))}
                        </div>
                    </div>

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

                    {isGlobal && agencies.length > 1 && (
                        <label className="block">
                            <span className={labelClass}>{t('order.filters.agency')}</span>
                            <select
                                value={activeAgencyId ?? ''}
                                onChange={(e) => setActiveAgencyId(e.target.value ? Number(e.target.value) : null)}
                                className={cx(input, 'sm:w-48')}
                            >
                                <option value="">{t('order.filters.allAgencies')}</option>
                                {agencies.map((agency) => (
                                    <option key={agency.id} value={agency.id}>
                                        {agency.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}

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

            <div className={cx(card, 'overflow-hidden')}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200/80 px-5 py-3.5 dark:border-ink-800">
                    <div>
                        <h2 className="text-sm font-bold text-ink-900 dark:text-white">{t('order.recent')}</h2>
                        <p className="text-xs text-ink-600 dark:text-ink-350">
                            {t('order.resultsCount', { count: meta.total })}
                            {lastFetchedAt && ` · ${t('order.lastRefresh', { elapsed: elapsedLabel(lastFetchedAt.toISOString()) })}`}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => void exportOrders()} className={button('secondary', 'sm')}>
                            <Download aria-hidden="true" className="h-4 w-4" />
                            {t('order.export')}
                        </button>
                        <ColumnsMenu visible={visibleColumns} onToggle={toggleColumn} />
                    </div>
                </div>

                {loading ? (
                    <LoadingState />
                ) : orders.length === 0 && localRows.length === 0 ? (
                    <EmptyState icon={Package} title={t('order.noOrders')} description={t('order.noOrdersHint')} />
                ) : (
                    <div className="relative overflow-x-auto">
                        <table className="w-full min-w-[1180px] text-sm">
                            <thead className="border-b border-ink-200/80 bg-ink-50 text-left text-[11px] font-bold uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-400">
                                <tr>
                                    <th scope="col" className="px-5 py-2.5">{t('order.table.code')}</th>
                                    <th scope="col" className="px-3 py-2.5">{t('order.client')}</th>
                                    {show('service') && <th scope="col" className="px-3 py-2.5">{t('order.table.service')}</th>}
                                    {show('items') && <th scope="col" className="px-3 py-2.5">{t('order.table.itemsWeight')}</th>}
                                    {show('total') && <th scope="col" className="px-3 py-2.5 text-right">{t('common.total')}</th>}
                                    {show('paid') && <th scope="col" className="px-3 py-2.5 text-right">{t('order.table.paid')}</th>}
                                    {show('remaining') && <th scope="col" className="px-3 py-2.5 text-right">{t('order.table.remaining')}</th>}
                                    {show('promised') && <th scope="col" className="px-3 py-2.5">{t('order.table.promised')}</th>}
                                    {show('status') && <th scope="col" className="px-3 py-2.5">{t('order.columns.status')}</th>}
                                    {show('sync') && <th scope="col" className="px-3 py-2.5">{t('order.table.sync')}</th>}
                                    <th scope="col" className="w-12 px-3 py-2.5">
                                        <span className="sr-only">{t('common.actions')}</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                                {localRows.map((p) => (
                                    <tr key={p.client_local_uuid} className="bg-amber-50/60 dark:bg-amber-400/5">
                                        <td className="px-5 py-3">
                                            <p className="font-display font-bold text-ink-900 dark:text-white">{p.preview.local_reference ?? t('order.pending')}</p>
                                            <p className="text-xs text-ink-500 dark:text-ink-400">{dayTime(p.created_at)}</p>
                                        </td>
                                        <td className="px-3 py-3 font-medium text-ink-900 dark:text-white">{p.preview.client_label}</td>
                                        {show('service') && <td className="px-3 py-3 text-ink-500">—</td>}
                                        {show('items') && <td className="px-3 py-3">{t('order.itemsCount', { count: p.preview.items_count })}</td>}
                                        {show('total') && <td className="px-3 py-3 text-right font-bold tabular-nums">{money(p.preview.total_amount)}</td>}
                                        {show('paid') && <td className="px-3 py-3 text-right text-ink-500">—</td>}
                                        {show('remaining') && <td className="px-3 py-3 text-right text-ink-500">—</td>}
                                        {show('promised') && <td className="px-3 py-3 text-ink-500">—</td>}
                                        {show('status') && <td className="px-3 py-3 text-ink-500">—</td>}
                                        {show('sync') && (
                                            <td className="px-3 py-3">
                                                <SyncDot tone={p.status === 'error' ? 'red' : 'amber'} label={p.status === 'error' ? t('order.sync.error') : t('order.sync.pending')} />
                                            </td>
                                        )}
                                        <td className="px-3 py-3">
                                            <Link to="/synchronisation" className={cx(textLink, 'text-xs')}>
                                                {t('order.sync.open')}
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                                {orders.map((order) => (
                                    <tr key={order.id} className="group transition hover:bg-ink-50 dark:hover:bg-ink-800/50">
                                        <td className="px-5 py-3">
                                            <Link to={`/orders/${order.id}`} className="font-display font-bold text-ink-900 hover:underline dark:text-white">
                                                {displayCode(order)}
                                            </Link>
                                            <p className="text-xs text-ink-500 dark:text-ink-400">{dayTime(order.created_at)}</p>
                                        </td>
                                        <td className="px-3 py-3">
                                            <p className="font-medium text-ink-900 dark:text-white">
                                                {order.client?.first_name} {order.client?.last_name}
                                            </p>
                                            {order.client?.phone && <p className="text-xs text-ink-500 dark:text-ink-400">{order.client.phone}</p>}
                                        </td>
                                        {show('service') && (
                                            <td className="px-3 py-3">
                                                {order.treatment_name ? (
                                                    <Pill tone={order.is_express ? 'accent' : 'neutral'}>{order.treatment_name}</Pill>
                                                ) : order.is_express ? (
                                                    <Pill tone="accent">{t('order.expressShort')}</Pill>
                                                ) : (
                                                    <Pill tone="neutral">{t('order.standard')}</Pill>
                                                )}
                                            </td>
                                        )}
                                        {show('items') && <td className="px-3 py-3 text-ink-700 dark:text-ink-200">{articlesLabel(order)}</td>}
                                        {show('total') && (
                                            <td className="px-3 py-3 text-right font-display font-bold tabular-nums text-ink-900 dark:text-white">{money(order.total_amount)}</td>
                                        )}
                                        {show('paid') && (
                                            <td className="px-3 py-3 text-right tabular-nums text-ink-600 dark:text-ink-350">
                                                {order.paid_amount != null ? money(order.paid_amount) : '—'}
                                            </td>
                                        )}
                                        {show('remaining') && (
                                            <td
                                                className={cx(
                                                    'px-3 py-3 text-right font-semibold tabular-nums',
                                                    order.balance_due ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300',
                                                )}
                                            >
                                                {order.balance_due != null ? money(order.balance_due) : '—'}
                                            </td>
                                        )}
                                        {show('promised') && (
                                            <td className="px-3 py-3 text-ink-600 dark:text-ink-350">
                                                {order.status === 'livre' && order.delivered_at
                                                    ? t('order.table.pickedUpAt', { time: dayTime(order.delivered_at) })
                                                    : order.promised_at
                                                      ? dayTime(order.promised_at)
                                                      : '—'}
                                            </td>
                                        )}
                                        {show('status') && (
                                            <td className="px-3 py-3">
                                                <StatusBadge kind="order" status={order.status} />
                                            </td>
                                        )}
                                        {show('sync') && (
                                            <td className="px-3 py-3">
                                                <SyncDot tone="emerald" label={t('order.sync.upToDate')} />
                                            </td>
                                        )}
                                        <td className="px-3 py-3">
                                            <RowMenu order={order} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-200/80 px-5 dark:border-ink-800">
                    <p className="py-3 text-xs text-ink-600 dark:text-ink-350">
                        {meta.total > 0 ? t('order.table.range', { from: rangeFrom, to: rangeTo, total: meta.total }) : ''}
                    </p>
                    <Pagination meta={meta} onPageChange={setPage} />
                </div>
            </div>
        </div>
    );
}
