import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ClipboardList, CloudUpload, Package, Zap } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { api } from '../../lib/api';
import { useFormat } from '../../lib/format';
import { useSyncQueue } from '../../lib/useSyncQueue';
import PageHeader, { Avatar } from '../../components/ui/PageHeader';
import StatusBadge, { Pill } from '../../components/ui/StatusBadge';
import { EmptyState, LoadingState } from '../../components/ui/Feedback';
import { button, card, cx } from '../../components/ui/styles';
import type { Order, OrderStatus, Paginated } from '../../types';

const STATUSES: OrderStatus[] = ['recu', 'trie', 'en_traitement', 'controle_qualite', 'pret', 'livre', 'annule'];

export default function OrdersList() {
    const { t } = useI18n();
    const { money, dateTime } = useFormat();
    const pending = useSyncQueue();
    const [orders, setOrders] = useState<Order[]>([]);
    const [status, setStatus] = useState<OrderStatus | ''>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        const query = status ? `?status=${status}` : '';
        api
            .get<Paginated<Order>>(`/orders${query}`)
            .then((res) => setOrders(res.data))
            .catch(() => setOrders([]))
            .finally(() => setLoading(false));
    }, [status]);

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

            <div role="group" aria-label={t('order.filterByStatus')} className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
                <button type="button" aria-pressed={status === ''} onClick={() => setStatus('')} className={filterClass(status === '')}>
                    {t('order.all')}
                </button>
                {STATUSES.map((s) => (
                    <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)} className={filterClass(status === s)}>
                        {t(`status.${s}`)}
                    </button>
                ))}
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
                                    {p.status === 'error' && <p className="mt-1 font-medium text-rose-700 dark:text-rose-300">{p.error}</p>}
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
                    <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                        {orders.map((order) => (
                            <li key={order.id}>
                                <Link
                                    to={`/orders/${order.id}`}
                                    className="group flex items-center gap-3 px-4 py-3.5 transition hover:bg-ink-50 focus-visible:bg-ink-50 sm:gap-4 sm:px-5 dark:hover:bg-ink-800/50 dark:focus-visible:bg-ink-800/50"
                                >
                                    <Avatar firstName={order.client?.first_name} lastName={order.client?.last_name} className="hidden sm:inline-flex" />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                            <span className="font-display font-bold text-ink-900 dark:text-white">
                                                {t('order.number')}
                                                {order.order_number}
                                            </span>
                                            {order.is_express && (
                                                <Pill tone="accent" icon={Zap}>
                                                    {t('order.expressShort')}
                                                </Pill>
                                            )}
                                        </div>
                                        <p className="truncate text-sm text-ink-600 dark:text-ink-350">
                                            {order.client?.first_name} {order.client?.last_name}
                                            <span aria-hidden="true"> · </span>
                                            {dateTime(order.created_at)}
                                            {order.items && (
                                                <>
                                                    <span aria-hidden="true"> · </span>
                                                    {t('order.itemsCount', { count: order.items.reduce((sum, item) => sum + item.quantity, 0) })}
                                                </>
                                            )}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-4">
                                        <span className="font-display font-bold tabular-nums text-ink-900 dark:text-white">{money(order.total_amount)}</span>
                                        <StatusBadge kind="order" status={order.status} />
                                    </div>
                                    <ChevronRight
                                        aria-hidden="true"
                                        className="hidden h-5 w-5 shrink-0 text-ink-400 transition group-hover:translate-x-0.5 group-hover:text-brand-700 sm:block dark:group-hover:text-brand-300"
                                    />
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
