import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { api, ApiError } from '../../lib/api';
import { queuePendingOrder } from '../../lib/offlineDb';
import { readCachedServices, writeCachedServices } from '../../lib/servicesCache';
import { readRecentClients, rememberClients } from '../../lib/recentClientsCache';
import { syncEvents } from '../../lib/sync';
import type { Client, Order, Service } from '../../types';

interface CartLine {
    service_id: number;
    quantity: number;
    description: string;
}

export default function NewOrder() {
    const { user, activeAgencyId } = useAuth();
    const { t } = useI18n();
    const navigate = useNavigate();

    const agencyId = user?.agency_id ?? activeAgencyId;

    const [services, setServices] = useState<(Service & { effective_price: number })[]>([]);
    const [clientQuery, setClientQuery] = useState('');
    const [clientResults, setClientResults] = useState<Client[]>(readRecentClients());
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [cart, setCart] = useState<CartLine[]>([]);
    const [isExpress, setIsExpress] = useState(false);
    const [notes, setNotes] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!agencyId) {
            return;
        }
        setServices(readCachedServices(agencyId));
        api
            .get<(Service & { effective_price: number })[]>(`/services?agency_id=${agencyId}`)
            .then((list) => {
                setServices(list);
                writeCachedServices(agencyId, list);
            })
            .catch(() => {
                // Hors-ligne : on garde le catalogue mis en cache lors du dernier chargement réussi.
            });
    }, [agencyId]);

    useEffect(() => {
        if (clientQuery.trim().length < 2) {
            return;
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => {
            api
                .get<{ data: Client[] }>(`/clients?search=${encodeURIComponent(clientQuery)}&agency_id=${agencyId}`, controller.signal)
                .then((res) => {
                    setClientResults(res.data);
                    rememberClients(res.data);
                })
                .catch(() => {
                    const term = clientQuery.toLowerCase();
                    setClientResults(
                        readRecentClients().filter(
                            (c) =>
                                c.agency_id === agencyId &&
                                (`${c.first_name} ${c.last_name}`.toLowerCase().includes(term) || c.phone.includes(term)),
                        ),
                    );
                });
        }, 300);
        return () => {
            clearTimeout(timeout);
            controller.abort();
        };
    }, [clientQuery, agencyId]);

    const total = useMemo(
        () =>
            cart.reduce((sum, line) => {
                const service = services.find((s) => s.id === line.service_id);
                return sum + (service?.effective_price ?? 0) * line.quantity;
            }, 0),
        [cart, services],
    );

    function addLine(serviceId: number) {
        setCart((current) => {
            const existing = current.find((l) => l.service_id === serviceId);
            if (existing) {
                return current.map((l) => (l.service_id === serviceId ? { ...l, quantity: l.quantity + 1 } : l));
            }
            return [...current, { service_id: serviceId, quantity: 1, description: '' }];
        });
    }

    function updateLine(serviceId: number, patch: Partial<CartLine>) {
        setCart((current) => current.map((l) => (l.service_id === serviceId ? { ...l, ...patch } : l)));
    }

    function removeLine(serviceId: number) {
        setCart((current) => current.filter((l) => l.service_id !== serviceId));
    }

    async function handleSubmit() {
        if (!selectedClient || cart.length === 0 || !agencyId) {
            return;
        }

        setError(null);
        setFeedback(null);
        setSubmitting(true);

        const clientLocalUuid = crypto.randomUUID();
        const payload = {
            client_id: selectedClient.id,
            client_local_uuid: clientLocalUuid,
            is_express: isExpress,
            notes: notes || null,
            items: cart.map((l) => ({
                service_id: l.service_id,
                quantity: l.quantity,
                description: l.description || null,
            })),
        };

        try {
            if (!navigator.onLine) {
                throw new TypeError('offline');
            }

            const order = await api.post<Order>('/orders', payload);
            setFeedback(t('order.submitted'));
            resetForm();
            navigate(`/orders/${order.id}`);
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.message);
            } else {
                await queuePendingOrder({
                    client_local_uuid: clientLocalUuid,
                    payload,
                    created_at: new Date().toISOString(),
                    status: 'pending',
                    preview: {
                        client_label: `${selectedClient.first_name} ${selectedClient.last_name}`,
                        total_amount: total,
                        items_count: cart.length,
                    },
                });
                syncEvents.dispatchEvent(new Event('change'));
                setFeedback(t('order.submittedOffline'));
                resetForm();
            }
        } finally {
            setSubmitting(false);
        }
    }

    function resetForm() {
        setCart([]);
        setSelectedClient(null);
        setClientQuery('');
        setIsExpress(false);
        setNotes('');
    }

    if (!agencyId) {
        return (
            <div className="space-y-6">
                <h1 className="text-xl font-semibold">{t('order.new')}</h1>
                <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    {t('order.selectAgency')}
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <h1 className="text-xl font-semibold">{t('order.new')}</h1>

            {feedback && (
                <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
                    {feedback}
                </p>
            )}
            {error && (
                <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
                    {error}
                </p>
            )}

            <section aria-labelledby="client-heading" className="space-y-2">
                <h2 id="client-heading" className="font-medium">
                    {t('order.client')}
                </h2>
                {selectedClient ? (
                    <div className="flex items-center justify-between rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600">
                        <span>
                            {selectedClient.first_name} {selectedClient.last_name} — {selectedClient.phone}
                        </span>
                        <button type="button" onClick={() => setSelectedClient(null)} className="text-sm text-indigo-600 dark:text-indigo-400">
                            {t('common.cancel')}
                        </button>
                    </div>
                ) : (
                    <>
                        <label htmlFor="client-search" className="sr-only">
                            {t('client.search')}
                        </label>
                        <input
                            id="client-search"
                            type="search"
                            placeholder={t('client.search')}
                            value={clientQuery}
                            onChange={(e) => setClientQuery(e.target.value)}
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-base dark:border-slate-600 dark:bg-slate-900"
                        />
                        {clientQuery.length >= 2 && (
                            <ul className="max-h-48 divide-y divide-slate-200 overflow-auto rounded-md border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
                                {clientResults.length === 0 && (
                                    <li className="px-3 py-2 text-sm text-slate-600 dark:text-slate-400">{t('client.noResults')}</li>
                                )}
                                {clientResults.map((client) => (
                                    <li key={client.id}>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedClient(client)}
                                            className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                                        >
                                            {client.first_name} {client.last_name} — {client.phone}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </>
                )}
            </section>

            <section aria-labelledby="services-heading" className="space-y-2">
                <h2 id="services-heading" className="font-medium">
                    {t('order.service')}
                </h2>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {services.map((service) => (
                        <button
                            key={service.id}
                            type="button"
                            onClick={() => addLine(service.id)}
                            className="rounded-md border border-slate-300 px-3 py-3 text-left text-sm hover:border-indigo-500 dark:border-slate-600"
                        >
                            <span className="block font-medium">{service.name}</span>
                            <span className="text-slate-600 dark:text-slate-400">{service.effective_price} FCFA</span>
                        </button>
                    ))}
                </div>
            </section>

            {cart.length > 0 && (
                <section aria-labelledby="cart-heading" className="space-y-2">
                    <h2 id="cart-heading" className="font-medium">
                        {t('order.items')}
                    </h2>
                    <ul className="space-y-2">
                        {cart.map((line) => {
                            const service = services.find((s) => s.id === line.service_id);
                            return (
                                <li key={line.service_id} className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 p-2 dark:border-slate-700">
                                    <span className="min-w-32 flex-1">{service?.name}</span>
                                    <label className="flex items-center gap-1 text-sm">
                                        {t('common.quantity')}
                                        <input
                                            type="number"
                                            min={1}
                                            value={line.quantity}
                                            onChange={(e) => updateLine(line.service_id, { quantity: Math.max(1, Number(e.target.value)) })}
                                            className="w-16 rounded-md border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
                                        />
                                    </label>
                                    <input
                                        type="text"
                                        placeholder={t('order.item')}
                                        value={line.description}
                                        onChange={(e) => updateLine(line.service_id, { description: e.target.value })}
                                        className="min-w-40 flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                                    />
                                    <button type="button" onClick={() => removeLine(line.service_id)} className="text-sm text-red-600 dark:text-red-400">
                                        ✕
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}

            <section className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={isExpress} onChange={(e) => setIsExpress(e.target.checked)} />
                    {t('order.express')}
                </label>
                <label className="flex-1 min-w-48 text-sm">
                    <span className="sr-only">{t('common.notes')}</span>
                    <input
                        type="text"
                        placeholder={t('common.notes')}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
                    />
                </label>
            </section>

            <footer className="flex items-center justify-between border-t border-slate-200 pt-4 dark:border-slate-700">
                <span className="text-lg font-semibold">
                    {t('common.total')} : {total} FCFA
                </span>
                <button
                    type="button"
                    onClick={() => void handleSubmit()}
                    disabled={!selectedClient || cart.length === 0 || submitting}
                    className="rounded-md bg-indigo-600 px-6 py-3 text-base font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    {t('order.submit')}
                </button>
            </footer>
        </div>
    );
}
