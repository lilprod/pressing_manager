import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Bell, PackageCheck, Search } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { api } from '../../lib/api';
import { useFormat } from '../../lib/format';
import PageHeader, { Avatar } from '../../components/ui/PageHeader';
import StatusBadge, { Pill } from '../../components/ui/StatusBadge';
import { EmptyState, LoadingState } from '../../components/ui/Feedback';
import { StatCard } from '../../components/ui/Metrics';
import Pagination from '../../components/ui/Pagination';
import { button, card, cx, input } from '../../components/ui/styles';
import type { Order, Paginated, PickupSummary } from '../../types';

/* Écran « Centre de retrait » (Figma SPARK PRESSING, section 05, "Retraits en
 * agence") : liste les dépôts prêts à être remis. Toutes les valeurs proviennent de
 * /pickups et /pickups/summary — voir CLAUDE.md pour ce qui a été omis faute de
 * données réelles (comparaison "vs lundi dernier", planning du jour, scan). */

export default function PickupsList() {
    const { t } = useI18n();
    const { money, dateTime } = useFormat();
    const { activeAgencyId } = useAuth();

    const [orders, setOrders] = useState<Order[]>([]);
    const [summary, setSummary] = useState<PickupSummary | null>(null);
    const [meta, setMeta] = useState<Pick<Paginated<Order>, 'current_page' | 'last_page' | 'total'>>({
        current_page: 1,
        last_page: 1,
        total: 0,
    });
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const params = new URLSearchParams({ page: String(page) });
        if (activeAgencyId) params.set('agency_id', String(activeAgencyId));
        api.get<PickupSummary>(`/pickups/summary?${params}`).then(setSummary).catch(() => setSummary(null));
    }, [activeAgencyId]);

    useEffect(() => {
        setLoading(true);
        const params = new URLSearchParams({ page: String(page) });
        if (activeAgencyId) params.set('agency_id', String(activeAgencyId));
        if (search.trim()) params.set('q', search.trim());
        api
            .get<Paginated<Order>>(`/pickups?${params}`)
            .then((res) => {
                setOrders(res.data);
                setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
            })
            .catch(() => setOrders([]))
            .finally(() => setLoading(false));
    }, [search, activeAgencyId, page]);

    useEffect(() => setPage(1), [activeAgencyId]);

    return (
        <div className="space-y-6">
            <PageHeader title={t('pickup.title')} subtitle={t('pickup.subtitle')} icon={PackageCheck} />

            {summary && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard label={t('pickup.summary.readyOrders')} value={summary.ready_orders} icon={PackageCheck} tone="brand" hint={t('pickup.summary.piecesReady', { count: summary.pieces_ready })} />
                    <StatCard label={t('pickup.summary.awaitingNotification')} value={summary.awaiting_notification} icon={Bell} tone="amber" />
                    <StatCard label={t('pickup.summary.pickupsToday')} value={summary.pickups_today} icon={PackageCheck} tone="emerald" />
                    <StatCard
                        label={t('pickup.summary.unpaid')}
                        value={money(summary.unpaid_amount)}
                        icon={AlertTriangle}
                        tone="rose"
                        hint={t('pickup.summary.unpaidOrders', { count: summary.unpaid_orders })}
                    />
                </div>
            )}

            <label className="relative block max-w-md">
                <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1);
                    }}
                    placeholder={t('pickup.searchPlaceholder')}
                    className={cx(input, 'pl-10')}
                />
            </label>

            <div className={cx(card, 'overflow-hidden')}>
                {loading ? (
                    <LoadingState />
                ) : orders.length === 0 ? (
                    <EmptyState icon={PackageCheck} title={t('pickup.none')} description={t('pickup.noneHint')} />
                ) : (
                    <div className="overflow-x-auto">
                        <div className="min-w-[1160px]">
                            <div
                                role="row"
                                className="flex items-center gap-4 border-b border-ink-200/80 bg-ink-50 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-400"
                            >
                                <span className="w-8 shrink-0" aria-hidden="true" />
                                <span className="w-28 shrink-0">{t('order.table.code')}</span>
                                <span className="w-48 shrink-0">{t('order.client')}</span>
                                <span className="w-28 shrink-0">{t('pickup.table.pieces')}</span>
                                <span className="w-36 shrink-0">{t('order.table.promised')}</span>
                                <span className="w-28 shrink-0 text-right">{t('pickup.table.balanceDue')}</span>
                                <span className="w-32 shrink-0">{t('pickup.table.notification')}</span>
                                <span className="w-28 shrink-0" aria-hidden="true" />
                            </div>

                            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                                {orders.map((order) => (
                                    <li key={order.id} className="flex items-center gap-4 px-5 py-3">
                                        <Avatar firstName={order.client?.first_name} lastName={order.client?.last_name} size="sm" />

                                        <div className="w-28 shrink-0">
                                            <p className="font-display font-bold text-ink-900 dark:text-white">
                                                {t('order.number')}
                                                {order.order_number}
                                            </p>
                                        </div>

                                        <div className="w-48 min-w-0 shrink-0">
                                            <p className="truncate font-medium text-ink-900 dark:text-white">
                                                {order.client?.first_name} {order.client?.last_name}
                                            </p>
                                            {order.client?.phone && <p className="truncate text-xs text-ink-500 dark:text-ink-400">{order.client.phone}</p>}
                                        </div>

                                        <p className="w-28 shrink-0 text-sm text-ink-700 dark:text-ink-200">
                                            {t('pickup.piecesCount', { count: order.pieces_remaining ?? 0 })}
                                        </p>

                                        <p className="w-36 shrink-0 text-sm text-ink-600 dark:text-ink-350">{order.promised_at ? dateTime(order.promised_at) : '—'}</p>

                                        <div className="w-28 shrink-0 text-right">
                                            {order.balance_due && order.balance_due > 0 ? (
                                                <span className="font-display font-bold tabular-nums text-red-700 dark:text-red-400">{money(order.balance_due)}</span>
                                            ) : (
                                                <Pill tone="emerald">{t('pickup.paid')}</Pill>
                                            )}
                                        </div>

                                        <div className="w-32 shrink-0">
                                            {order.notification_status ? (
                                                <StatusBadge kind="notification" status={order.notification_status} />
                                            ) : (
                                                <Pill tone="amber">{t('pickup.notNotified')}</Pill>
                                            )}
                                        </div>

                                        <div className="w-28 shrink-0">
                                            <Link to={`/pickups/${order.id}`} className={button('primary', 'sm')}>
                                                {t('pickup.process')}
                                            </Link>
                                        </div>
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
