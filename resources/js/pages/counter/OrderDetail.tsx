import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Clock, FileQuestion, Phone, Printer, StickyNote, Zap } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { api } from '../../lib/api';
import { useFormat } from '../../lib/format';
import OrderItemRow from '../../components/OrderItemRow';
import PrintableTicket from '../../components/PrintableTicket';
import PrintableLabel from '../../components/PrintableLabel';
import InvoicePanel from '../../components/InvoicePanel';
import { Avatar } from '../../components/ui/PageHeader';
import StatusBadge, { Pill } from '../../components/ui/StatusBadge';
import { EmptyState, LoadingState } from '../../components/ui/Feedback';
import { button, card, cardPadded, cx, sectionTitle, textLink } from '../../components/ui/styles';
import type { Order, OrderItem } from '../../types';

type PrintTarget = { kind: 'ticket' } | { kind: 'label'; item: OrderItem; dataUri: string } | null;

export default function OrderDetail() {
    const { id } = useParams<{ id: string }>();
    const { t } = useI18n();
    const { money, dateTime } = useFormat();
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
        // La réponse PATCH ne recharge pas toujours la relation `service` : on conserve celle déjà affichée.
        setOrder((current) =>
            current
                ? { ...current, items: current.items.map((i) => (i.id === updated.id ? { ...updated, service: updated.service ?? i.service } : i)) }
                : current,
        );
    }

    async function printLabel(item: OrderItem) {
        const { data_uri } = await api.get<{ qr_code: string; data_uri: string }>(`/order-items/${item.id}/qr-code`);
        setPrintTarget({ kind: 'label', item, dataUri: data_uri });
    }

    const backLink = (
        <Link to="/orders" className={cx(textLink, 'no-print inline-flex items-center gap-1.5 text-sm')}>
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            {t('order.backToOrders')}
        </Link>
    );

    if (loading) {
        return <LoadingState />;
    }

    if (!order) {
        return (
            <div className="space-y-4">
                {backLink}
                <div role="alert" className={card}>
                    <EmptyState icon={FileQuestion} title={t('common.error')} />
                </div>
            </div>
        );
    }

    const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

    return (
        <div className="space-y-6">
            {backLink}

            <header className={cx(cardPadded, 'relative overflow-hidden')}>
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-100/60 blur-2xl dark:bg-brand-400/10"
                />
                <div className="relative flex flex-wrap items-start justify-between gap-5">
                    <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="font-display text-2xl font-extrabold text-ink-900 sm:text-3xl dark:text-white">
                                {t('order.number')}
                                {order.order_number}
                            </h1>
                            <StatusBadge kind="order" status={order.status} size="md" />
                            {order.is_express && (
                                <Pill tone="accent" icon={Zap}>
                                    {t('order.expressShort')}
                                </Pill>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-600 dark:text-ink-350">
                            <span className="inline-flex items-center gap-2">
                                <Avatar firstName={order.client?.first_name} lastName={order.client?.last_name} size="sm" />
                                <span className="font-semibold text-ink-900 dark:text-ink-50">
                                    {order.client?.first_name} {order.client?.last_name}
                                </span>
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <Phone aria-hidden="true" className="h-4 w-4" />
                                {order.client?.phone}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <CalendarDays aria-hidden="true" className="h-4 w-4" />
                                {dateTime(order.created_at)}
                            </span>
                            {order.promised_at && (
                                <span className="inline-flex items-center gap-1.5 font-semibold text-brand-700 dark:text-brand-300">
                                    <Clock aria-hidden="true" className="h-4 w-4" />
                                    {t('order.promisedAt')} {dateTime(order.promised_at)}
                                </span>
                            )}
                        </div>
                        {order.notes && (
                            <p className="inline-flex items-start gap-1.5 text-sm text-ink-700 dark:text-ink-300">
                                <StickyNote aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                                {order.notes}
                            </p>
                        )}
                    </div>

                    <div className="flex flex-col items-start gap-3 sm:items-end">
                        <div className="sm:text-right">
                            <p className="text-xs font-semibold uppercase tracking-wider text-ink-600 dark:text-ink-350">{t('common.total')}</p>
                            <p className="font-display text-3xl font-extrabold tabular-nums text-ink-900 dark:text-white">{money(order.total_amount)}</p>
                        </div>
                        <button type="button" onClick={() => setPrintTarget({ kind: 'ticket' })} className={cx(button('secondary'), 'no-print')}>
                            <Printer aria-hidden="true" className="h-4 w-4" />
                            {t('common.print')} — {t('order.ticket')}
                        </button>
                    </div>
                </div>
            </header>

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
                <section aria-labelledby="items-heading" className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <h2 id="items-heading" className={sectionTitle}>
                            {t('order.items')}
                        </h2>
                        <Pill tone="neutral">{t('order.itemsCount', { count: itemCount })}</Pill>
                    </div>
                    <ul className="space-y-3">
                        {order.items.map((item) => (
                            <OrderItemRow key={item.id} item={item} onUpdated={handleItemUpdated} onPrintLabel={printLabel} />
                        ))}
                    </ul>
                </section>

                <div className="lg:sticky lg:top-20">
                    <InvoicePanel order={order} />
                </div>
            </div>

            {printTarget?.kind === 'ticket' && <PrintableTicket order={order} />}
            {printTarget?.kind === 'label' && <PrintableLabel item={printTarget.item} dataUri={printTarget.dataUri} />}
        </div>
    );
}
