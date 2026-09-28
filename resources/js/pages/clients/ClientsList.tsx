import { useEffect, useState } from 'react';
import { useI18n } from '../../contexts/I18nContext';
import { api, ApiError } from '../../lib/api';
import ClientForm from './ClientForm';
import type { Client, Order, Paginated } from '../../types';
import { Link } from 'react-router-dom';
import { Award, ChevronRight, Mail, MapPin, Pencil, Phone, Search, Trash2, UserPlus, Users, X } from 'lucide-react';
import PageHeader, { Avatar } from '../../components/ui/PageHeader';
import StatusBadge, { Pill } from '../../components/ui/StatusBadge';
import { Alert, EmptyState, LoadingState } from '../../components/ui/Feedback';
import Pagination from '../../components/ui/Pagination';
import { button, card, cx, iconButton, inputLg, sectionTitle } from '../../components/ui/styles';

export default function ClientsList() {
    const { t } = useI18n();
    const [search, setSearch] = useState('');
    const [clients, setClients] = useState<Client[]>([]);
    const [meta, setMeta] = useState<Pick<Paginated<Client>, 'current_page' | 'last_page' | 'total'>>({
        current_page: 1,
        last_page: 1,
        total: 0,
    });
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<Client | null | 'new'>(null);
    const [selected, setSelected] = useState<Client | null>(null);
    const [selectedOrders, setSelectedOrders] = useState<Order[]>([]);
    const [actionError, setActionError] = useState<string | null>(null);

    function reload() {
        setLoading(true);
        const params = new URLSearchParams({ page: String(page) });
        if (search) params.set('search', search);
        api
            .get<Paginated<Client>>(`/clients?${params}`)
            .then((res) => {
                setClients(res.data);
                setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
            })
            .finally(() => setLoading(false));
    }

    useEffect(reload, [page]);

    useEffect(() => {
        const timeout = setTimeout(() => {
            if (page === 1) reload();
            else setPage(1);
        }, 250);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    useEffect(() => {
        if (selected) {
            api.get<Paginated<Order>>(`/orders?client_id=${selected.id}`).then((res) => setSelectedOrders(res.data));
        }
    }, [selected]);

    async function toggleActive(client: Client) {
        setActionError(null);
        const updated = await api.patch<Client>(`/clients/${client.id}`, { is_active: !client.is_active });
        setSelected(updated);
        reload();
    }

    async function deleteClient(client: Client) {
        setActionError(null);
        try {
            await api.delete(`/clients/${client.id}`);
            setSelected(null);
            reload();
        } catch (err) {
            setActionError(err instanceof ApiError ? err.message : t('common.error'));
        }
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={t('nav.clients')}
                subtitle={t('client.listSubtitle')}
                icon={Users}
                actions={
                    <button type="button" onClick={() => setEditing('new')} className={button('primary')}>
                        <UserPlus aria-hidden="true" className="h-4 w-4" />
                        {t('client.new')}
                    </button>
                }
            />

            <div className={cx('grid items-start gap-6', selected && 'lg:grid-cols-[minmax(0,1fr)_360px]')}>
                <div className="min-w-0 space-y-4">
                    <label htmlFor="client-list-search" className="sr-only">
                        {t('client.search')}
                    </label>
                    <div className="relative">
                        <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                        <input
                            id="client-list-search"
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={t('client.search')}
                            className={cx(inputLg, 'pl-12')}
                        />
                    </div>

                    {editing && (
                        <ClientForm
                            client={editing === 'new' ? null : editing}
                            onCancel={() => setEditing(null)}
                            onSaved={() => {
                                setEditing(null);
                                reload();
                            }}
                        />
                    )}

                    <div className={cx(card, 'overflow-hidden')}>
                        {loading ? (
                            <LoadingState />
                        ) : clients.length === 0 ? (
                            <EmptyState icon={Users} title={t('client.noResults')} description={t('client.noResultsHint')} />
                        ) : (
                            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                                {clients.map((client) => (
                                    <li
                                        key={client.id}
                                        className={cx(
                                            'flex items-center gap-2 pr-3 transition',
                                            selected?.id === client.id ? 'bg-brand-50/70 dark:bg-brand-400/10' : 'hover:bg-ink-50 dark:hover:bg-ink-800/50',
                                        )}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => setSelected(client)}
                                            aria-pressed={selected?.id === client.id}
                                            className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left sm:px-5"
                                        >
                                            <Avatar firstName={client.first_name} lastName={client.last_name} />
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center gap-2 truncate font-semibold text-ink-900 dark:text-ink-50">
                                                    <span className="truncate">
                                                        {client.first_name} {client.last_name}
                                                    </span>
                                                    {!client.is_active && <Pill tone="rose">{t('client.inactive')}</Pill>}
                                                </span>
                                                <span className="flex flex-wrap gap-x-3 text-sm text-ink-600 dark:text-ink-350">
                                                    <span>{client.phone}</span>
                                                    {client.email && <span className="hidden truncate sm:inline">{client.email}</span>}
                                                </span>
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setEditing(client)}
                                            className={button('ghost', 'sm')}
                                        >
                                            <Pencil aria-hidden="true" className="h-4 w-4" />
                                            <span className="hidden sm:inline">{t('common.edit')}</span>
                                            <span className="sr-only sm:hidden">{t('common.edit')}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <Pagination meta={meta} onPageChange={setPage} />
                    </div>
                </div>

                {selected && (
                    <aside aria-label={t('client.details')} className={cx(card, 'animate-fade-in overflow-hidden lg:sticky lg:top-20')}>
                        <div className="relative flex flex-col items-center gap-3 bg-gradient-to-b from-brand-50 to-white px-5 pb-5 pt-7 text-center dark:from-brand-400/10 dark:to-ink-900">
                            <button type="button" onClick={() => setSelected(null)} aria-label={t('common.close')} className={cx(iconButton, 'absolute right-2 top-2')}>
                                <X aria-hidden="true" className="h-5 w-5" />
                            </button>
                            <Avatar firstName={selected.first_name} lastName={selected.last_name} size="lg" />
                            <h2 className="font-display text-lg font-bold text-ink-900 dark:text-white">
                                {selected.first_name} {selected.last_name}
                            </h2>
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-100 px-3 py-1 text-sm font-semibold text-accent-800 dark:bg-accent-400/15 dark:text-accent-300">
                                <Award aria-hidden="true" className="h-4 w-4" />
                                {t('client.loyaltyPoints')}: {selected.loyalty_points}
                            </span>
                            {!selected.is_active && <Pill tone="rose">{t('client.inactive')}</Pill>}
                        </div>

                        {actionError && (
                            <div className="px-5 pt-4">
                                <Alert tone="error">{actionError}</Alert>
                            </div>
                        )}

                        <div className="flex flex-wrap gap-2 px-5 pt-4">
                            <button type="button" onClick={() => void toggleActive(selected)} className={button('secondary', 'sm')}>
                                {selected.is_active ? t('client.deactivate') : t('client.activate')}
                            </button>
                            {selectedOrders.length === 0 && (
                                <button type="button" onClick={() => void deleteClient(selected)} className={button('dangerGhost', 'sm')}>
                                    <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                                    {t('common.delete')}
                                </button>
                            )}
                        </div>

                        <dl className="space-y-2.5 border-y border-ink-200/80 px-5 py-4 text-sm dark:border-ink-800">
                            <div className="flex items-center gap-2.5">
                                <dt>
                                    <Phone aria-hidden="true" className="h-4 w-4 text-ink-600 dark:text-ink-350" />
                                    <span className="sr-only">{t('client.phone')}</span>
                                </dt>
                                <dd className="text-ink-800 dark:text-ink-100">{selected.phone}</dd>
                            </div>
                            {selected.email && (
                                <div className="flex items-center gap-2.5">
                                    <dt>
                                        <Mail aria-hidden="true" className="h-4 w-4 text-ink-600 dark:text-ink-350" />
                                        <span className="sr-only">{t('client.email')}</span>
                                    </dt>
                                    <dd className="truncate text-ink-800 dark:text-ink-100">{selected.email}</dd>
                                </div>
                            )}
                            {selected.address && (
                                <div className="flex items-center gap-2.5">
                                    <dt>
                                        <MapPin aria-hidden="true" className="h-4 w-4 text-ink-600 dark:text-ink-350" />
                                        <span className="sr-only">{t('client.address')}</span>
                                    </dt>
                                    <dd className="text-ink-800 dark:text-ink-100">{selected.address}</dd>
                                </div>
                            )}
                        </dl>

                        <div className="space-y-2 p-5">
                            <h3 className={cx(sectionTitle, 'text-sm')}>{t('nav.orders')}</h3>
                            {selectedOrders.length === 0 ? (
                                <p className="text-sm text-ink-600 dark:text-ink-350">{t('order.noOrders')}</p>
                            ) : (
                                <ul className="-mx-2 space-y-0.5">
                                    {selectedOrders.map((order) => (
                                        <li key={order.id}>
                                            <Link
                                                to={`/orders/${order.id}`}
                                                className="group flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm transition hover:bg-ink-50 dark:hover:bg-ink-800/50"
                                            >
                                                <span className="font-semibold text-ink-900 dark:text-ink-50">
                                                    {t('order.number')}
                                                    {order.order_number}
                                                </span>
                                                <span className="flex items-center gap-1.5">
                                                    <StatusBadge kind="order" status={order.status} />
                                                    <ChevronRight aria-hidden="true" className="h-4 w-4 text-ink-400 group-hover:text-brand-700 dark:group-hover:text-brand-300" />
                                                </span>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </aside>
                )}
            </div>
        </div>
    );
}
