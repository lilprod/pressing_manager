import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../contexts/I18nContext';
import { api } from '../../lib/api';
import { useSyncQueue } from '../../lib/useSyncQueue';
import type { Order, OrderStatus, Paginated } from '../../types';

const STATUSES: OrderStatus[] = ['recu', 'trie', 'en_traitement', 'controle_qualite', 'pret', 'livre', 'annule'];

export default function OrdersList() {
    const { t } = useI18n();
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

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h1 className="text-xl font-semibold">{t('nav.orders')}</h1>
                <label className="flex items-center gap-2 text-sm">
                    {t('order.filterByStatus')}
                    <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value as OrderStatus | '')}
                        className="rounded-md border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
                    >
                        <option value="">{t('order.all')}</option>
                        {STATUSES.map((s) => (
                            <option key={s} value={s}>
                                {t(`status.${s}`)}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            {pending.length > 0 && (
                <ul aria-label={t('order.pending')} className="space-y-2">
                    {pending.map((p) => (
                        <li
                            key={p.client_local_uuid}
                            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-700 dark:bg-amber-950"
                        >
                            <span className="font-medium">{t('order.pending')}</span> — {p.preview.client_label} ({p.preview.items_count}{' '}
                            {t('order.items').toLowerCase()}, {p.preview.total_amount} FCFA)
                            {p.status === 'error' && <span className="ml-2 text-red-600 dark:text-red-400">{p.error}</span>}
                        </li>
                    ))}
                </ul>
            )}

            {loading ? (
                <p>{t('common.loading')}</p>
            ) : (
                <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                    {orders.map((order) => (
                        <li key={order.id}>
                            <Link
                                to={`/orders/${order.id}`}
                                className="flex items-center justify-between px-2 py-3 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                                <span>
                                    {t('order.number')}
                                    {order.order_number} — {order.client?.first_name} {order.client?.last_name}
                                </span>
                                <span className="text-sm text-slate-600 dark:text-slate-400">{t(`status.${order.status}`)}</span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
