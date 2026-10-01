import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, CalendarClock, ChevronRight, ClipboardList, Clock, CloudUpload, PackageCheck, PiggyBank, Package, Zap } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { api } from '../../lib/api';
import { useFormat } from '../../lib/format';
import { useSyncQueue } from '../../lib/useSyncQueue';
import PageHeader, { Avatar } from '../../components/ui/PageHeader';
import StatusBadge, { Pill } from '../../components/ui/StatusBadge';
import { EmptyState, LoadingState } from '../../components/ui/Feedback';
import { StatCard } from '../../components/ui/Metrics';
import Pagination from '../../components/ui/Pagination';
import { button, card, cx } from '../../components/ui/styles';
import type { Order, OrderStats, OrderStatus, Paginated } from '../../types';

const STATUSES: OrderStatus[] = ['recu', 'trie', 'en_traitement', 'controle_qualite', 'pret', 'livre', 'annule'];

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
    const [readyToday, setReadyToday] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        // Pour un rôle global, l'agence choisie dans l'en-tête filtre la liste (vide = toutes les agences).
        const params = new URLSearchParams({ page: String(page) });
        if (status) params.set('status', status);
        if (readyToday) params.set('ready_today', '1');
        if (activeAgencyId) params.set('agency_id', String(activeAgencyId));
        api
            .get<Paginated<Order>>(`/orders?${params}`)
            .then((res) => {
                setOrders(res.data);
                setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
            })
            .catch(() => setOrders([]))
            .finally(() => setLoading(false));
    }, [status, readyToday, activeAgencyId, page]);

    useEffect(() => {
        const params = new URLSearchParams();
        if (activeAgencyId) params.set('agency_id', String(activeAgencyId));
        api
            .get<OrderStats>(`/orders/stats?${params}`)
            .then(setStats)
            .catch(() => setStats(null));
    }, [activeAgencyId]);

    function changeStatus(next: OrderStatus | '') {
        setStatus(next);
        setPage(1);
    }

    function toggleReadyToday() {
        setReadyToday((current) => !current);
        setPage(1);
    }

    useEffect(() => setPage(1), [activeAgencyId]);

    const filterClass = (active: boolean) =>
        cx(
            'inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-semibold transition duration-150 active:scale-95',
            active
                ? 'bg-ink-900 text-white shadow-sm dark:bg-white dark:text-ink-950'
                : 'bg-white text-ink-700 ring-1 ring-inset ring-ink-200 hover:bg-ink-50 hover:ring-ink-300 dark:bg-ink-900 dark:text-ink-200 dark:ring-ink-700 dark:hover:bg-ink-800',
        );

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

            <div role="group" aria-label={t('order.filterByStatus')} className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
                <button type="button" aria-pressed={status === ''} onClick={() => changeStatus('')} className={filterClass(status === '')}>
                    {t('order.all')}
                </button>
                {STATUSES.map((s) => (
                    <button key={s} type="button" aria-pressed={status === s} onClick={() => changeStatus(s)} className={filterClass(status === s)}>
                        {t(`status.${s}`)}
                    </button>
                ))}
                <button
                    type="button"
                    aria-pressed={readyToday}
                    onClick={toggleReadyToday}
                    className={cx(filterClass(readyToday), 'inline-flex items-center gap-1.5')}
                >
                    <Clock aria-hidden="true" className="h-4 w-4" />
                    {t('order.readyToday')}
                </button>
            </div>

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
                {loading ? (
                    <LoadingState />
                ) : orders.length === 0 ? (
                    <EmptyState icon={Package} title={t('order.noOrders')} description={t('order.noOrdersHint')} />
                ) : (
                    <div>
                        <div
                            role="row"
                            className="hidden items-center gap-4 border-b border-ink-200/80 bg-ink-50 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink-500 sm:flex dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-400"
                        >
                            <span className="w-8 shrink-0" aria-hidden="true" />
                            <span className="w-28 shrink-0">{t('order.table.code')}</span>
                            <span className="min-w-0 flex-1">{t('order.client')}</span>
                            <span className="w-24 shrink-0">{t('order.table.service')}</span>
                            <span className="w-24 shrink-0">{t('order.items')}</span>
                            <span className="w-24 shrink-0 text-right">{t('common.total')}</span>
                            <span className="w-32 shrink-0">{t('order.table.status')}</span>
                            <span className="w-36 shrink-0">{t('order.table.promised')}</span>
                            <span className="w-5 shrink-0" aria-hidden="true" />
                        </div>

                        <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                            {orders.map((order) => (
                                <li key={order.id}>
                                    <Link
                                        to={`/orders/${order.id}`}
                                        className="group flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3.5 transition hover:bg-ink-50 focus-visible:bg-ink-50 sm:flex-nowrap sm:px-5 sm:py-3 dark:hover:bg-ink-800/50 dark:focus-visible:bg-ink-800/50"
                                    >
                                        <Avatar firstName={order.client?.first_name} lastName={order.client?.last_name} size="sm" className="hidden sm:inline-flex" />

                                        <div className="w-full shrink-0 sm:w-28">
                                            <p className="font-display font-bold text-ink-900 dark:text-white">
                                                {t('order.number')}
                                                {order.order_number}
                                            </p>
                                            <p className="text-xs text-ink-500 dark:text-ink-400">{dateTime(order.created_at)}</p>
                                        </div>

                                        <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                                            <p className="truncate font-medium text-ink-900 dark:text-white">
                                                {order.client?.first_name} {order.client?.last_name}
                                            </p>
                                            {order.client?.phone && <p className="truncate text-xs text-ink-500 dark:text-ink-400">{order.client.phone}</p>}
                                        </div>

                                        <div className="w-24 shrink-0">
                                            {order.is_express ? (
                                                <Pill tone="accent" icon={Zap}>
                                                    {t('order.expressShort')}
                                                </Pill>
                                            ) : (
                                                <Pill tone="neutral">{t('order.standard')}</Pill>
                                            )}
                                        </div>

                                        <p className="w-24 shrink-0 text-sm text-ink-700 dark:text-ink-200">
                                            {order.items ? t('order.itemsCount', { count: order.items.reduce((sum, item) => sum + item.quantity, 0) }) : '—'}
                                        </p>

                                        <span className="w-24 shrink-0 text-right font-display font-bold tabular-nums text-ink-900 dark:text-white">
                                            {money(order.total_amount)}
                                        </span>

                                        <div className="w-32 shrink-0">
                                            <StatusBadge kind="order" status={order.status} />
                                        </div>

                                        <p className="w-36 shrink-0 text-sm text-ink-600 dark:text-ink-350">{order.promised_at ? dateTime(order.promised_at) : '—'}</p>

                                        <ChevronRight
                                            aria-hidden="true"
                                            className="hidden h-5 w-5 shrink-0 text-ink-400 transition group-hover:translate-x-0.5 group-hover:text-brand-700 sm:block dark:group-hover:text-brand-300"
                                        />
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                <Pagination meta={meta} onPageChange={setPage} />
            </div>
        </div>
    );
}
