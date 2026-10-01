import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Award, Banknote, CircleDollarSign, FileQuestion, Mail, MapPin, Pencil, Phone, ShoppingBag, StickyNote, Trash2 } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { api, ApiError } from '../../lib/api';
import { useFormat } from '../../lib/format';
import { Avatar } from '../../components/ui/PageHeader';
import StatusBadge, { Pill } from '../../components/ui/StatusBadge';
import { Alert, EmptyState, LoadingState } from '../../components/ui/Feedback';
import { StatCard } from '../../components/ui/Metrics';
import { Timeline, type TimelineEntry } from '../../components/ui/Timeline';
import { button, card, cardPadded, cx, sectionTitle, textLink } from '../../components/ui/styles';
import type { ClientDetail, Order, Paginated } from '../../types';

export default function ClientDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { t } = useI18n();
    const { money, dateTime } = useFormat();

    const [client, setClient] = useState<ClientDetail | null>(null);
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        setLoading(true);
        api
            .get<ClientDetail>(`/clients/${id}`)
            .then(setClient)
            .catch((err) => {
                if (err instanceof ApiError && err.status === 404) setNotFound(true);
            })
            .finally(() => setLoading(false));
        api
            .get<Paginated<Order>>(`/orders?client_id=${id}&per_page=10`)
            .then((res) => setOrders(res.data))
            .catch(() => setOrders([]));
    }, [id]);

    const timeline = useMemo<TimelineEntry[]>(() => {
        if (!client) return [];
        const depositEntries: TimelineEntry[] = orders.map((order) => ({
            id: `order-${order.id}`,
            label: t('client.timeline.deposit', { number: String(order.order_number) }),
            at: order.created_at,
        }));
        const pickupEntries: TimelineEntry[] = client.recent_pickups.map((pickup) => ({
            id: `pickup-${pickup.id}`,
            label: t('client.timeline.pickup', { name: pickup.recipient_name }),
            detail: pickup.order ? `${t('order.number')}${pickup.order.order_number}` : undefined,
            at: pickup.processed_at,
            actor: pickup.processor?.name ?? null,
        }));
        return [...depositEntries, ...pickupEntries].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    }, [client, orders, t]);

    async function toggleActive() {
        if (!client) return;
        setActionError(null);
        const updated = await api.patch<ClientDetail>(`/clients/${client.id}`, { is_active: !client.is_active });
        setClient({ ...client, ...updated });
    }

    async function deleteClient() {
        if (!client) return;
        setActionError(null);
        try {
            await api.delete(`/clients/${client.id}`);
            navigate('/clients');
        } catch (err) {
            setActionError(err instanceof ApiError ? err.message : t('common.error'));
        }
    }

    const backLink = (
        <Link to="/clients" className={cx(textLink, 'inline-flex items-center gap-1.5 text-sm')}>
            {t('client.backToList')}
        </Link>
    );

    if (loading) return <LoadingState />;

    if (notFound || !client) {
        return (
            <div className="space-y-4">
                {backLink}
                <div role="alert" className={card}>
                    <EmptyState icon={FileQuestion} title={t('client.notFound')} />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {backLink}

            <header className={cx(card, 'overflow-hidden')}>
                <div className="flex flex-col gap-5 bg-gradient-to-br from-brand-50 to-white p-6 dark:from-brand-400/10 dark:to-ink-900 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                        <Avatar firstName={client.first_name} lastName={client.last_name} size="lg" />
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="font-display text-2xl font-bold text-ink-900 dark:text-white">
                                    {client.first_name} {client.last_name}
                                </h1>
                                {client.loyalty_tier_name && <Pill tone="accent">{client.loyalty_tier_name}</Pill>}
                                {client.is_active ? <Pill tone="emerald">{t('client.activeStatus')}</Pill> : <Pill tone="rose">{t('client.inactive')}</Pill>}
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-700 dark:text-ink-200">
                                <span className="inline-flex items-center gap-1.5">
                                    <Phone aria-hidden="true" className="h-4 w-4" />
                                    {client.phone}
                                </span>
                                {client.email && (
                                    <span className="inline-flex items-center gap-1.5">
                                        <Mail aria-hidden="true" className="h-4 w-4" />
                                        {client.email}
                                    </span>
                                )}
                                {client.address && (
                                    <span className="inline-flex items-center gap-1.5">
                                        <MapPin aria-hidden="true" className="h-4 w-4" />
                                        {client.address}
                                    </span>
                                )}
                            </div>
                            <span className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-800 dark:text-accent-300">
                                <Award aria-hidden="true" className="h-4 w-4" />
                                {t('client.loyaltyPoints')}: {client.loyalty_points}
                            </span>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Link to={`/clients/${client.id}/edit`} className={button('secondary', 'sm')}>
                            <Pencil aria-hidden="true" className="h-4 w-4" />
                            {t('common.edit')}
                        </Link>
                        <button type="button" onClick={() => void toggleActive()} className={button('secondary', 'sm')}>
                            {client.is_active ? t('client.deactivate') : t('client.activate')}
                        </button>
                        {client.deposits_count === 0 && (
                            <button type="button" onClick={() => void deleteClient()} className={button('dangerGhost', 'sm')}>
                                <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                                {t('common.delete')}
                            </button>
                        )}
                    </div>
                </div>
            </header>

            {actionError && <Alert tone="error">{actionError}</Alert>}

            {client.deposits_count > 0 && (
                <p className="text-sm text-ink-500 dark:text-ink-400">{t('client.deleteHint')}</p>
            )}

            <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:grid-cols-4">
                <StatCard label={t('client.stats.lifetimeValue')} value={money(client.lifetime_value)} icon={Banknote} tone="brand" />
                <StatCard label={t('client.stats.depositsCount')} value={client.deposits_count} icon={ShoppingBag} tone="sky" />
                <StatCard label={t('client.stats.averageBasket')} value={money(client.average_basket)} icon={CircleDollarSign} tone="emerald" />
                <StatCard label={t('order.balanceDue.title')} value={money(client.balance_due)} icon={Banknote} tone="amber" />
            </div>

            {client.notes && (
                <div className={cx(cardPadded, 'space-y-2')}>
                    <h2 className={cx(sectionTitle, 'flex items-center gap-2 text-sm')}>
                        <StickyNote aria-hidden="true" className="h-4 w-4 text-ink-500 dark:text-ink-350" />
                        {t('client.notes')}
                    </h2>
                    <p className="whitespace-pre-line text-sm text-ink-700 dark:text-ink-200">{client.notes}</p>
                </div>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
                <section className={cx(cardPadded, 'space-y-3')}>
                    <h2 className={cx(sectionTitle, 'text-sm')}>{t('client.timeline.title')}</h2>
                    <Timeline entries={timeline} emptyLabel={t('order.noOrders')} />
                </section>

                <section className={cx(cardPadded, 'space-y-3')}>
                    <h2 className={cx(sectionTitle, 'text-sm')}>{t('client.recentOrders.title')}</h2>
                    {orders.length === 0 ? (
                        <EmptyState icon={ShoppingBag} title={t('order.noOrders')} compact />
                    ) : (
                        <ul className="-mx-2 divide-y divide-ink-100 dark:divide-ink-800">
                            {orders.map((order) => (
                                <li key={order.id}>
                                    <Link
                                        to={`/orders/${order.id}`}
                                        className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-sm transition hover:bg-ink-50 dark:hover:bg-ink-800/50"
                                    >
                                        <span className="min-w-0 flex-1">
                                            <span className="block font-semibold text-ink-900 dark:text-ink-50">
                                                {t('order.number')}
                                                {order.order_number}
                                            </span>
                                            <span className="block text-xs text-ink-500 dark:text-ink-400">{dateTime(order.created_at)}</span>
                                        </span>
                                        <span className="shrink-0 font-display font-bold tabular-nums text-ink-900 dark:text-white">{money(order.total_amount)}</span>
                                        <StatusBadge kind="order" status={order.status} />
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>
        </div>
    );
}
