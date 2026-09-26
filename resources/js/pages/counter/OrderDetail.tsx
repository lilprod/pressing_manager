import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useI18n } from '../../contexts/I18nContext';
import { api } from '../../lib/api';
import OrderItemRow from '../../components/OrderItemRow';
import PrintableTicket from '../../components/PrintableTicket';
import PrintableLabel from '../../components/PrintableLabel';
import InvoicePanel from '../../components/InvoicePanel';
import type { Order, OrderItem } from '../../types';

type PrintTarget = { kind: 'ticket' } | { kind: 'label'; item: OrderItem; dataUri: string } | null;

export default function OrderDetail() {
    const { id } = useParams<{ id: string }>();
    const { t } = useI18n();
    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(true);
    const [printTarget, setPrintTarget] = useState<PrintTarget>(null);

    useEffect(() => {
        if (!id) return;
        api
            .get<Order>(`/orders/${id}`)
            .then(setOrder)
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => {
        if (printTarget) {
            const timeout = setTimeout(() => window.print(), 100);
            return () => clearTimeout(timeout);
        }
    }, [printTarget]);

    function handleItemUpdated(updated: OrderItem) {
        setOrder((current) => (current ? { ...current, items: current.items.map((i) => (i.id === updated.id ? updated : i)) } : current));
    }

    async function printLabel(item: OrderItem) {
        const { data_uri } = await api.get<{ qr_code: string; data_uri: string }>(`/order-items/${item.id}/qr-code`);
        setPrintTarget({ kind: 'label', item, dataUri: data_uri });
    }

    if (loading) {
        return <p>{t('common.loading')}</p>;
    }

    if (!order) {
        return <p role="alert">{t('common.error')}</p>;
    }

    return (
        <div className="space-y-6">
            <header className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h1 className="text-xl font-semibold">
                        {t('order.number')}
                        {order.order_number}
                    </h1>
                    <p className="text-slate-600 dark:text-slate-400">
                        {order.client?.first_name} {order.client?.last_name} — {order.client?.phone}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setPrintTarget({ kind: 'ticket' })}
                    className="no-print rounded-md border border-slate-300 px-4 py-2 text-sm hover:border-indigo-500 dark:border-slate-600"
                >
                    {t('common.print')} — {t('order.ticket')}
                </button>
            </header>

            <section aria-labelledby="items-heading">
                <h2 id="items-heading" className="mb-2 font-medium">
                    {t('order.items')}
                </h2>
                <ul className="space-y-3">
                    {order.items.map((item) => (
                        <OrderItemRow key={item.id} item={item} onUpdated={handleItemUpdated} onPrintLabel={printLabel} />
                    ))}
                </ul>
            </section>

            <InvoicePanel order={order} />

            {printTarget?.kind === 'ticket' && <PrintableTicket order={order} />}
            {printTarget?.kind === 'label' && <PrintableLabel item={printTarget.item} dataUri={printTarget.dataUri} />}
        </div>
    );
}
