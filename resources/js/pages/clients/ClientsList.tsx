import { useEffect, useState } from 'react';
import { useI18n } from '../../contexts/I18nContext';
import { api } from '../../lib/api';
import ClientForm from './ClientForm';
import type { Client, Order, Paginated } from '../../types';

export default function ClientsList() {
    const { t } = useI18n();
    const [search, setSearch] = useState('');
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<Client | null | 'new'>(null);
    const [selected, setSelected] = useState<Client | null>(null);
    const [selectedOrders, setSelectedOrders] = useState<Order[]>([]);

    function reload() {
        setLoading(true);
        const query = search ? `?search=${encodeURIComponent(search)}` : '';
        api
            .get<Paginated<Client>>(`/clients${query}`)
            .then((res) => setClients(res.data))
            .finally(() => setLoading(false));
    }

    useEffect(() => {
        const timeout = setTimeout(reload, 250);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    useEffect(() => {
        if (selected) {
            api.get<Paginated<Order>>(`/orders?client_id=${selected.id}`).then((res) => setSelectedOrders(res.data));
        }
    }, [selected]);

    return (
        <div className="grid gap-6 md:grid-cols-[1fr_320px]">
            <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h1 className="text-xl font-semibold">{t('nav.clients')}</h1>
                    <button
                        type="button"
                        onClick={() => setEditing('new')}
                        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                        {t('client.new')}
                    </button>
                </div>

                <label htmlFor="client-list-search" className="sr-only">
                    {t('client.search')}
                </label>
                <input
                    id="client-list-search"
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('client.search')}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-900"
                />

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

                {loading ? (
                    <p>{t('common.loading')}</p>
                ) : (
                    <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                        {clients.map((client) => (
                            <li key={client.id} className="flex items-center justify-between px-2 py-2">
                                <button type="button" onClick={() => setSelected(client)} className="text-left hover:underline">
                                    {client.first_name} {client.last_name} — {client.phone}
                                </button>
                                <button type="button" onClick={() => setEditing(client)} className="text-sm text-indigo-600 dark:text-indigo-400">
                                    {t('common.save')}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {selected && (
                <aside aria-label={t('client.new')} className="space-y-2 rounded-md border border-slate-200 p-4 dark:border-slate-700">
                    <h2 className="font-semibold">
                        {selected.first_name} {selected.last_name}
                    </h2>
                    <p className="text-sm">{selected.phone}</p>
                    {selected.email && <p className="text-sm">{selected.email}</p>}
                    <p className="text-sm">
                        {t('client.loyaltyPoints')}: {selected.loyalty_points}
                    </p>
                    <h3 className="mt-3 text-sm font-medium">{t('nav.orders')}</h3>
                    <ul className="text-sm">
                        {selectedOrders.map((order) => (
                            <li key={order.id}>
                                {t('order.number')}
                                {order.order_number} — {t(`status.${order.status}`)}
                            </li>
                        ))}
                    </ul>
                    <button type="button" onClick={() => setSelected(null)} className="text-sm text-slate-600 dark:text-slate-400">
                        {t('common.close')}
                    </button>
                </aside>
            )}
        </div>
    );
}
